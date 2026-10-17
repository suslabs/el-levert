import Handler from "../Handler.js";

import UserTracker from "../discord/tracker/UserTracker.js";
import WebsocketCommandContext from "../../structures/command/context/WebsocketCommandContext.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";

import CommandError from "../../errors/CommandError.js";

function getClientId(packet, socket) {
    return packet.clientId ?? socket.clientId ?? "unknown";
}

function normalizePacket(packet) {
    packet ??= {};

    return {
        id: packet.id ?? null,
        op: packet.op,
        data: packet.data ?? {}
    };
}

function reply(socket, packet, status, data) {
    packet = normalizePacket(packet);

    return socket.send(
        JSON.stringify({
            id: packet.id,
            op: packet.op,
            status,
            data
        })
    );
}

class WebsocketCommandHandler extends Handler {
    static $name = "websocketCommandHandler";

    constructor(enabled) {
        super(enabled, {
            minResponseTime: 0,
            globalTimeLimit: 0
        });

        this.clientTracker = new UserTracker(0);
    }

    async execute(packet, socket) {
        packet = normalizePacket(packet);

        const cmd = this._getCommand(packet);

        if (cmd === null) {
            reply(socket, packet, "error", `Command "${packet.op}" not found.`);
            return;
        }

        let context = null;

        try {
            context = this._createContext(cmd, packet, socket);
            await this._executeAndReply(cmd, context);
        } catch (err) {
            if (this._handleTrackedUserError(err, packet, socket, context)) {
                return;
            }

            this._handleExecutionError(err, packet, socket, context, cmd);
        }
    }

    contextReply(context, status, data) {
        return reply(
            context.socket,
            {
                id: context.id,
                op: context.commandName
            },
            status,
            data
        );
    }

    _getCommand(packet) {
        return getClient().websocketCommandManager.searchCommands(packet.op);
    }

    _createContext(cmd, packet, socket) {
        return new WebsocketCommandContext({
            command: cmd,
            commandName: packet.op,
            handler: this,
            args: packet.data,
            id: packet.id,
            clientId: getClientId(packet, socket),
            socket
        });
    }

    async _executeAndReply(cmd, context) {
        await this.clientTracker.withUser(context.clientId, async () => {
            const data = await this._executeCommand(cmd, context);

            await context.reply("success", data);
        });
    }

    async _executeCommand(cmd, context) {
        const timeoutError = new CommandError(`Timed out executing command "${cmd.name}".`);

        return await Util.runWithTimeout(() => cmd.execute(context), timeoutError, this.globalTimeLimit, {
            timeoutControls: ({ clearTimer }) => context.setDisableTimeoutHook(clearTimer)
        });
    }

    _handleTrackedUserError(err, packet, socket, context) {
        if (err.name !== "HandlerError" || err.message !== "User already exists") {
            return false;
        }

        const clientId = context?.clientId ?? getClientId(packet, socket),
            msg = `Another command is already in flight for client: ${clientId}`;

        if (context !== null) {
            context.reply("error", msg);
        } else {
            reply(socket, packet, "error", msg);
        }

        return true;
    }

    _handleExecutionError(err, packet, socket, context, cmd) {
        getLogger().error(
            `Encountered exception while executing websocket command "${cmd.name}":\n${Util.getErrorMessage(err)}`
        );

        if (context !== null) {
            context.reply("error", err.message);
        } else {
            reply(socket, packet, "error", err.message);
        }
    }
}

export default WebsocketCommandHandler;
