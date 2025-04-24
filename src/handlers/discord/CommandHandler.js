import { bold } from "discord.js";

import MessageHandler from "./MessageHandler.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import LoggerUtil from "../../util/LoggerUtil.js";

function logUsage(msg, name, args) {
    const cmdArgs = !Util.empty(args) ? ` with args:${LoggerUtil.formatLog(args)}` : ".";

    getLogger().info(
        `User ${msg.author.id} (${msg.author.username}) used command "${name}" in channel ${msg.channel.id} (${DiscordUtil.formatChannelName(msg.channel)})${cmdArgs}`
    );
}

function logTime(time) {
    getLogger().info(`Command execution took ${Util.formatNumber(time)}ms.`);
}

function logOutput(cmd, out) {
    if (!getLogger().isDebugEnabled()) {
        return;
    }

    getLogger().debug(`Command "${cmd.name}" returned:${LoggerUtil.formatLog(out)}`);
}

class CommandHandler extends MessageHandler {
    static $name = "commandHandler";
    priority = 1;

    constructor(enabled) {
        super(enabled, true, true, {
            minResponseTime: getClient().config.minResponseTime,
            userSweepInterval: 10 / Util.durationSeconds.milli
        });
    }

    async execute(msg) {
        if (!getClient().commandManager.isCommand(msg.content, msg)) {
            return false;
        }

        if (this.userTracker.findUser(msg.author.id)) {
            await this.reply(msg, ":warning: Please wait for the previous command to finish.");
            return false;
        }

        const [cmd, _, args] = getClient().commandManager.getCommand(msg.content, msg);

        if (cmd === null) {
            return false;
        }

        this.userTracker.addUser(msg.author.id);
        this._sendTyping(msg);

        await this._executeAndReply(cmd, msg, args);
        this.userTracker.removeUser(msg.author.id);

        return true;
    }

    async _executeAndReply(cmd, msg, args) {
        const t1 = performance.now();

        let res,
            execErr = null;

        try {
            [res] = await this._executeCommand(cmd, msg, args);
        } catch (err) {
            execErr = err;
        }

        await this._addDelay(t1);

        if (execErr !== null) {
            await this._handleExecutionError(execErr, msg, cmd);
            return;
        }

        let options;

        if (Array.isArray(res) && !Util.empty(res)) {
            const obj = Util.last(res);

            if (TypeTester.isObject(obj) && obj.type === "options") {
                options = res.pop();
            }
        }

        logOutput(cmd, res);
        await this.reply(msg, res, options);
    }

    async _executeCommand(cmd, msg, args) {
        logUsage(msg, cmd.name, args);

        const t1 = performance.now();

        const res = await cmd.execute(args, { msg });

        const t2 = performance.now(),
            time = Util.timeDelta(t2, t1);

        logTime(time);
        return [res, time];
    }

    async _handleExecutionError(err, msg, cmd) {
        getLogger().error("Command execution failed:", err);

        try {
            await this.reply(msg, {
                content: `:no_entry_sign: Encountered exception while executing command ${bold(cmd.name)}:`,
                ...DiscordUtil.getFileAttach(err?.stack ?? err?.message ?? "No message", "error.js")
            });
        } catch (err) {
            getLogger().error("Reporting command error failed:", err);
        }
    }
}

export default CommandHandler;
