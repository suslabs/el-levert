import { bold } from "discord.js";

import MessageHandler from "./MessageHandler.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import LoggerUtil from "../../util/LoggerUtil.js";

function logCommandUsage(msg, name, args) {
    const cmdArgs = !Util.empty(args) ? ` with args:${LoggerUtil.formatLog(args)}` : ".";

    getLogger().info(
        `User ${msg.author.id} (${msg.author.username}) used command "${name}" in channel ${msg.channel.id} (${DiscordUtil.formatChannelName(msg.channel)})${cmdArgs}`
    );
}

function logExecutionTime(elapsed) {
    getLogger().info(`Command execution took ${Util.formatNumber(elapsed)} ms.`);
}

function logCommandOutput(cmd, out) {
    if (getLogger().isDebugEnabled()) {
        if (Array.isArray(out) && Util.single(out)) {
            out = Util.first(out);
        }

        getLogger().debug(`Command "${cmd.name}" returned:${LoggerUtil.formatLog(out)}`);
    }
}

class CommandHandler extends MessageHandler {
    static $name = "commandHandler";
    priority = 1;

    constructor(enabled) {
        super(enabled, true, true, {
            userSweepInterval: 10 / Util.durationSeconds.milli
        });
    }

    async execute(msg) {
        if (!getClient().commandManager.isCommand(msg.content, msg)) {
            return false;
        }

        const executeMain = async () => {
            const [cmd, , args] = getClient().commandManager.getCommand(msg.content, msg);

            if (!cmd) {
                return false;
            }

            this._sendTyping(msg);

            await this._executeAndReply(cmd, msg, args);
            return true;
        };

        try {
            return await this.userTracker.withUser(msg.author.id, executeMain);
        } catch (err) {
            switch (err.name) {
                case "HandlerError":
                    if (err.message === "User already exists") {
                        await this.reply(msg, ":warning: Please wait for the previous command to finish.");
                        break;
                    }
                // eslint-disable-next-line no-fallthrough
                default:
                    throw err;
            }

            return true;
        }
    }

    async _executeCommand(cmd, msg, args) {
        logCommandUsage(msg, cmd.name, args);

        let outRes = null,
            outErr = null;

        const t1 = performance.now();
        try {
            outRes = await cmd.execute(args, { msg });
        } catch (err) {
            outErr = err;
        }
        const t2 = performance.now();

        const outInfo = {
            elapsed: Util.timeDelta(t2, t1)
        };

        logExecutionTime(outInfo.elapsed);
        return [outRes, outErr, outInfo];
    }

    async _executeAndReply(cmd, msg, args) {
        const [res, execErr, info] = await this._executeCommand(cmd, msg, args);
        await this._addDelay(info.elapsed, true);

        if (execErr !== null) {
            const out = `executing command ${bold(cmd.name)}`;
            await this.replyWithError(msg, execErr, "command", out);

            return;
        }

        let options;

        if (Array.isArray(res) && !Util.empty(res)) {
            const obj = Util.last(res);

            if (TypeTester.isObject(obj) && obj.type === "options") {
                options = res.pop();
            }
        }

        logCommandOutput(cmd, res);
        await this.reply(msg, res, options);
    }
}

export default CommandHandler;
