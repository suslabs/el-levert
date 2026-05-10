import { bold } from "discord.js";

import MessageHandler from "./MessageHandler.js";

import CommandContext from "../../structures/command/context/CommandContext.js";

import { getClient, getConfig, getEmoji, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import LoggerUtil from "../../util/LoggerUtil.js";
import Benchmark from "../../util/misc/Benchmark.js";

import CommandError from "../../errors/CommandError.js";

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

        this.commandWaitTime = getConfig().commandWaitTime;
    }

    async execute(msg, options) {
        options = TypeTester.isObject(options) ? options : {};

        if (!getClient().commandManager.isCommand(msg.content, msg)) {
            return false;
        }

        const executeMain = async () => {
            const [cmd, , , parsed] = getClient().commandManager.getCommand(msg.content, msg);

            if (!cmd || parsed === null) {
                return false;
            }

            this._sendTyping(msg);

            await this._executeAndReply(
                cmd,
                new CommandContext({
                    command: cmd,
                    commandName: parsed.name,
                    raw: msg.content,
                    rawContent: parsed.content,
                    argsText: parsed.argsText,
                    parseResult: parsed,
                    message: msg,
                    handler: this,
                    isEdit: options.isEdit ?? false
                })
            );

            return true;
        };

        try {
            return await this.userTracker.withUser(msg.author.id, executeMain);
        } catch (err) {
            switch (err.name) {
                case "HandlerError":
                    if (err.message === "User already exists") {
                        await this.reply(msg, `${getEmoji("warn")} Please wait for the previous command to finish.`);
                        break;
                    }
                // eslint-disable-next-line no-fallthrough
                default:
                    throw err;
            }

            return true;
        }
    }

    async resubmit(msg) {
        if (getClient().commandManager.isCommand(msg.content, msg)) {
            await this.delete(msg);
            return await this.execute(msg, { isEdit: true });
        } else {
            return await this.delete(msg);
        }
    }

    async _executeCommand(cmd, context) {
        logCommandUsage(context.msg, cmd.name, context.argsText);

        let outRes = null,
            outErr = null;

        const timer = this._startProcessingTimer(context),
            timeoutError = new CommandError(`Timed out executing command ${bold(cmd.name)}.`);

        const timeKey = Benchmark.startTiming(Symbol("command_execute"));

        try {
            outRes = await Util.runWithTimeout(() => cmd.execute(context), timeoutError, this.globalTimeLimit);
        } catch (err) {
            outErr = err;
        } finally {
            this._stopProcessingTimer(timer);
        }

        const outInfo = {
            elapsed: Benchmark.stopTiming(timeKey, false),
            timedOut: outErr === timeoutError
        };

        logExecutionTime(outInfo.elapsed);
        return [outRes, outErr, outInfo];
    }

    async _executeAndReply(cmd, context) {
        const [res, execErr, info] = await this._executeCommand(cmd, context);
        await this._addDelay(info.elapsed, true);

        if (execErr !== null) {
            if (info.timedOut) {
                const timeoutMsg = `${getEmoji("error")} ${execErr.message}`;
                await this.contextReply(context, timeoutMsg);
                return;
            }

            const out = `executing command ${bold(cmd.name)}`;

            await this.contextReplyWithError(context, execErr, "command", out);
            return;
        }

        if (context.replied) {
            return;
        }

        let output = res,
            options;

        if (Array.isArray(output) && !Util.empty(output)) {
            const obj = Util.last(output);

            if (TypeTester.isObject(obj) && obj.type === "options") {
                options = output.pop();
            }
        }

        logCommandOutput(cmd, output);
        await this.contextReply(context, output, options);
    }

    _startProcessingTimer(context) {
        if (!Number.isFinite(this.commandWaitTime) || this.commandWaitTime <= 0) {
            return null;
        }

        return setTimeout(() => {
            this._sendProcessingReply(context).catch(err => {
                getLogger().error("Could not send processing reply:", err);
            });
        }, this.commandWaitTime);
    }

    _stopProcessingTimer(timer) {
        if (timer != null) {
            clearTimeout(timer);
        }
    }

    async _sendProcessingReply(context) {
        if (context.replied || context.processingReplySent) {
            return null;
        }

        context.processingReplySent = true;
        return await this.reply(context.msg, `${getEmoji("waiting")} Processing command...`);
    }
}

export default CommandHandler;
