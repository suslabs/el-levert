import Transport from "winston-transport";
import { EmbedBuilder, TimestampStyles, codeBlock, time, DiscordAPIError } from "discord.js";

import { EmbedColors, defaultColor } from "./EmbedColors.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import IntervalLoop from "../../util/misc/IntervalLoop.js";
import { isErrorCode } from "../../util/discord/ErrorCodes.js";

import LoggerError from "../../errors/LoggerError.js";

function getEmbedColor(level) {
    return EmbedColors[level] ?? defaultColor;
}

class BaseDiscordTransport extends Transport {
    constructor(options) {
        options = ObjectUtil.guaranteeObject(options);
        super(options);

        const compName = this.constructor.$name;

        if (!Util.nonemptyString(compName)) {
            throw new LoggerError("Discord transport must have a default name");
        } else if (typeof this.sendLog !== "function") {
            throw new LoggerError("Child class must have a sendLog function");
        }

        const charLimit = options.charLimit ?? DiscordUtil.embedCharLimit,
            name = options.name ?? compName,
            sendInterval = options.sendInterval ?? 0,
            client = options.client ?? null;

        this.charLimit = Util.clamp(charLimit, 0, DiscordUtil.embedCharLimit);
        this.name = name;
        this.sendInterval = sendInterval;

        this.client = client;
        this._hasClient = client !== null;

        this.initialized = false;

        if (typeof this.init === "function") {
            this.init(options);
        } else {
            this.initialized = true;
        }

        this._buffer = [];
        this._sendLoop = new IntervalLoop(this._sendLogs, this.sendInterval, err => this._handleDiscordError(err));

        if (this.sendDelayed) {
            this._sendLoop.start();
        }
    }

    get sendDelayed() {
        return this.sendInterval > 0;
    }

    log(info, callback) {
        setImmediate(() => this.emit("logged", info));

        if (!this.initialized || info.discord === false) {
            callback();
            return;
        }

        if (this.sendDelayed) {
            this._buffer.push(info);
        } else {
            this._logToDiscord(info).catch(err => this._handleDiscordError(err));
        }

        callback();
    }

    close() {
        this.initialized = false;

        return Util.maybeAsyncThen(this._sendLoop.stop(), () => {
            if (typeof this.onClose === "function") {
                return this.onClose();
            }
        });
    }

    static _disableCodes = [];

    _formatLog(info) {
        let content = "",
            fileContent = "";

        const embed = new EmbedBuilder().setTitle(Util.capitalize(info.level)).setColor(getEmbedColor(info.level));

        if (info.timestamp != null) {
            const date = new Date(info.timestamp),
                timestamp = Math.round(date.getTime() * Util.durationSeconds.milli),
                formattedTimestamp = time(timestamp, TimestampStyles.RelativeTime);

            embed.setTimestamp(date);
            embed.setTitle(`${embed.data.title} | ${formattedTimestamp}`);
        }

        if (info.stack != null) {
            const formattedStack = codeBlock("js", info.stack);

            if (Util.overSizeLimits(formattedStack, DiscordUtil.msgCharLimit)) {
                fileContent = `--- Error stack:\n${info.stack}\n`;
            } else {
                content += formattedStack;
            }
        }

        if (info.meta != null) {
            for (const [key, value] of Object.entries(info.meta)) {
                embed.addFields({
                    name: key,
                    value
                });
            }
        }

        if (info.service != null) {
            embed.addFields({
                name: "service",
                value: info.service
            });
        }

        if (this._hasClient) {
            const username = this.client.user.displayName,
                avatar = this.client.user.displayAvatarURL();

            embed.setAuthor({
                name: username,
                iconURL: avatar
            });
        }

        const description = codeBlock(info.message);

        if (DiscordUtil.embedComponentsOverSizeLimit({ ...embed.data, description }, { total: this.charLimit })) {
            fileContent += `--- Log message:\n${info.message}`;
        } else {
            embed.setDescription(description);
        }

        const out = {
            content,
            embeds: [embed],
            ...(Util.empty(fileContent) ? {} : DiscordUtil.getFileAttach(fileContent, "log.txt"))
        };

        return out;
    }

    async _logToDiscord(info) {
        const out = this._formatLog(info);
        await this.sendLog(out);
    }

    _sendLogs = async () => {
        if (!this.initialized) {
            return;
        }

        const info = this._buffer.shift();

        if (typeof info === "undefined") {
            return;
        }

        await this._logToDiscord(info);
    };

    _handleDiscordError(err) {
        console.error("Error occured while sending message to discord:");
        console.error(err);

        if (!(err instanceof DiscordAPIError)) {
            return;
        }

        if (this.constructor._disableCodes.some(category => isErrorCode(category, err))) {
            if (typeof this.getDisabledMessage === "function") {
                const disabledMessage = this.getDisabledMessage();
                console.info(disabledMessage);
            }

            this.close();
        }
    }
}

export default BaseDiscordTransport;
