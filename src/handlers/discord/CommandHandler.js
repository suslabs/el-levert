import { bold } from "discord.js";

import MessageHandler from "./MessageHandler.js";

import CommandContext from "../../structures/command/context/CommandContext.js";
import CommandParser from "../../parsers/command/CommandParser.js";

import { getClient, getConfig, getEmoji, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import LoggerUtil from "../../util/LoggerUtil.js";
import Benchmark from "../../util/misc/Benchmark.js";

import CommandError from "../../errors/CommandError.js";

function logCommandUsage(msg, name, args) {
    const cmdArgs = !Util.empty(args) ? ` with args:${LoggerUtil.formatLog(args)}` : ".";

    getLogger().info(
        `User ${DiscordUtil.formatUser(msg.author)} used command "${name}" in channel ${msg.channel.id} (${DiscordUtil.formatChannelName(msg.channel)})${cmdArgs}`
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

        getLogger().debug(`Command "${cmd.name}" returned:${DiscordUtil.formatMessageLog(out)}`);
    }
}

class CommandHandler extends MessageHandler {
    static $name = "commandHandler";
    priority = 1;

    constructor(enabled) {
        super(enabled, true, true, {
            userSweepInterval: 2 * getConfig().globalTimeLimit
        });

        this.commandWaitTime = getConfig().commandWaitTime;
        this.replyTimeout = getConfig().interactionTimeout;
    }

    async execute(msg, options) {
        options = ObjectUtil.guaranteeObject(options);

        const invocation = await this._resolveInvocation(msg);

        if (invocation === null) {
            return false;
        }

        return await this._executeInvocation(msg, invocation, options);
    }

    async resubmit(msg) {
        const invocation = await this._resolveInvocation(msg);

        const deleted = await this.delete(msg);
        return invocation === null ? deleted : await this._executeInvocation(msg, invocation, { isEdit: true });
    }

    async _executeInvocation(msg, invocation, options) {
        options = ObjectUtil.guaranteeObject(options);

        const executeMain = async () => {
            const command = invocation.command;

            if (await this.checkRateLimit(msg)) {
                return false;
            }

            this._sendTyping(msg);

            const context = await this._createContext(msg, invocation, options.isEdit);
            await this._executeAndReply(command, context);

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

    async _resolveInvocation(msg) {
        if (getClient().commandManager.isCommand(msg.content, msg)) {
            return this._resolveCommandInvocation(msg);
        } else {
            return await this._resolveReplyInvocation(msg);
        }
    }

    _resolveCommandInvocation(msg) {
        const [command, , , parsed] = getClient().commandManager.getCommand(msg.content, msg);

        if (command === null || parsed === null) {
            return null;
        }

        return {
            command,
            parsed,
            previousContext: null
        };
    }

    async _resolveReplyInvocation(msg) {
        const trigger = await this._fetchReplyTrigger(msg);

        if (trigger === null) {
            return null;
        }

        const replyMsg = await this._resolveReplyMsg(msg);

        if (this._isReplyExpired(replyMsg)) {
            return null;
        }

        const previousContext = await this._restoreContext(trigger);
        return this._createReplyInvocation(msg, previousContext);
    }

    async _fetchReplyTrigger(msg) {
        const triggerId = this.replyTracker.findTriggerId("reply", msg.reference?.messageId);
        return triggerId === null ? null : await getClient().fetchMessage(msg.channelId, triggerId);
    }

    async _restoreContext(msg) {
        let invocation;

        if (getClient().commandManager.isCommand(msg.content, msg)) {
            invocation = this._resolveCommandInvocation(msg);
        } else {
            invocation = await this._restoreReplyInvocation(msg);
        }

        return invocation === null ? null : await this._createContext(msg, invocation);
    }

    async _restoreReplyInvocation(msg) {
        const trigger = await this._fetchReplyTrigger(msg);

        if (trigger === null) {
            return null;
        }

        const previousContext = await this._restoreContext(trigger);
        return this._createReplyInvocation(msg, previousContext);
    }

    _createReplyInvocation(msg, previousContext) {
        if (previousContext === null || !previousContext.command.continueOnReply) {
            return null;
        }

        const command = previousContext.command,
            parsed = CommandParser.parseInvocation(`${command.name} ${msg.content}`);

        return {
            command,
            parsed,
            previousContext
        };
    }

    async _createContext(msg, invocation, isEdit = false) {
        const { command, parsed, previousContext } = invocation;

        return new CommandContext({
            command,
            commandName: parsed.name,
            raw: parsed.raw,
            argsText: parsed.argsText,
            parseResult: parsed,
            message: msg,
            replyMsg: await this._resolveReplyMsg(msg),
            previousContext,
            handler: this,
            isEdit
        });
    }

    _isReplyExpired(replyMsg) {
        if (replyMsg === null) {
            return true;
        }

        const timestamp = replyMsg.editedTimestamp ?? replyMsg.createdTimestamp;
        return Date.now() - timestamp > this.replyTimeout;
    }

    async _resolveReplyMsg(msg) {
        if (msg.referencedMessage != null) {
            return msg.referencedMessage;
        }

        const refId = msg.reference?.messageId;

        if (!Util.nonemptyString(refId)) {
            return null;
        }

        try {
            if (msg.channel != null && msg.channel.isTextBased()) {
                return await msg.channel.messages.fetch(refId);
            }

            const channelId = msg.channelId;

            if (Util.nonemptyString(channelId)) {
                return await getClient().fetchMessage(channelId, refId);
            }
        } catch {
            return null;
        }

        return null;
    }

    async _executeCommand(cmd, context) {
        logCommandUsage(context.msg, cmd.name, context.argsText);

        let outRes = null,
            outErr = null;

        const timer = this._startProcessingTimer(context),
            timeoutError = new CommandError(`Timed out executing command ${bold(cmd.name)}.`);

        Benchmark.startTiming("command_execute");

        try {
            outRes = await this._runCommandWithTimeout(cmd, context, timeoutError);
        } catch (err) {
            outErr = err;
        } finally {
            context.setDisableTimeoutHook();
            this._stopProcessingTimer(timer, context);
        }

        const outInfo = {
            elapsed: Benchmark.stopTiming("command_execute", false),
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

    async _runCommandWithTimeout(cmd, context, timeoutError) {
        return await Util.runWithTimeout(() => cmd.execute(context), timeoutError, this.globalTimeLimit, {
            timeoutControls: ({ clearTimer }) => context.setDisableTimeoutHook(clearTimer)
        });
    }

    _startProcessingTimer(context) {
        if (!Number.isFinite(this.commandWaitTime) || this.commandWaitTime <= 0) {
            return null;
        }

        return setTimeout(
            () => context.deferReply().catch(err => getLogger().error("Could not send processing reply:", err)),
            this.commandWaitTime
        );
    }

    _stopProcessingTimer(timer, context) {
        if (timer !== null) {
            clearTimeout(timer);
        }

        if (this.getReply(context.msg) === null) {
            context.abortProcessing();
        }
    }
}

export default CommandHandler;
