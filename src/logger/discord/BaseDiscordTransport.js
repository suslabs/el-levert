import Transport from "winston-transport";
import { EmbedBuilder, TimestampStyles, codeBlock, time, DiscordAPIError } from "discord.js";

import { EmbedColors, defaultColor } from "./EmbedColors.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import DiscordUtil from "../../util/DiscordUtil.js";

import LoggerError from "../../errors/LoggerError.js";

class BaseDiscordTransport extends Transport {
    constructor(options) {
        options = TypeTester.isObject(options) ? options : {};
        super(options);

        const compName = this.constructor.$name;

        if (!Util.nonemptyString(compName)) {
            throw new LoggerError("Discord transport must have a default name");
        } else if (typeof this.sendLog !== "function") {
            throw new LoggerError("Child class must have a sendLog function");
        }

        const charLimit = options.charLimit ?? DiscordUtil.embedCharLimit;
        this.charLimit = Util.clamp(charLimit, 0, DiscordUtil.embedCharLimit);

        this.name = options.name ?? compName;
        this.sendInterval = options.sendInterval ?? 0;

        this.client = options.client;
        this._hasClient = options.client != null;

        this.initialized = false;

        if (typeof this.init === "function") {
            this.init(options);
        } else {
            this.initialized = true;
        }

        this._buffer = [];
        this._sendTimer = null;

        this._startSendLoop();
    }

    get sendDelayed() {
        return this.sendInterval > 0;
    }

    log(info, callback) {
        setImmediate(() => {
            this.emit("logged", info);
        });

        if (!this.initialized || info?.discord === false) {
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
        if (typeof this.onClose === "function") {
            this.onClose();
        }

        this.initialized = false;
        this._stopSendLoop();
    }

    static _disableCodes = [];

    static _getEmbedColor(level) {
        return EmbedColors[level] ?? defaultColor;
    }

    _formatLog(info) {
        let content = "",
            fileContent = "",
            embed = new EmbedBuilder();

        embed.setTitle(Util.capitalize(info.level));
        embed.setColor(BaseDiscordTransport._getEmbedColor(info.level));

        if (info.stack != null) {
            if (Util.overSizeLimits(info.stack, DiscordUtil.msgCharLimit)) {
                const formattedStack = codeBlock("js", info.stack);
                content += formattedStack;
            } else {
                fileContent += `--- Error stack:\n${info.stack}`;
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

        if (info.timestamp != null) {
            const date = new Date(info.timestamp),
                timestamp = Math.round(date.getTime() * Util.durationSeconds.milli),
                formattedTimestamp = time(timestamp, TimestampStyles.RelativeTime);

            embed.setTimestamp(date);
            embed.setTitle(`${embed.data.title} | ${formattedTimestamp}`);
        }

        if (this._hasClient) {
            const username = this.client.user.displayName,
                avatar = this.client.user.displayAvatarURL();

            embed.setAuthor({
                name: username,
                iconURL: avatar
            });
        }

        const totalEmbedChars = DiscordUtil.getEmbedSize(embed);

        if (info.message.length < this.charLimit - totalEmbedChars) {
            const formattedMessage = codeBlock(info.message);
            embed.setDescription(formattedMessage);
        } else {
            fileContent += `--- Log message:\n${info.message}`;
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

    _sendLogs = () => {
        if (!this.initialized) {
            return;
        }

        const info = this._buffer.shift();

        if (typeof info === "undefined") {
            return;
        }

        this._logToDiscord(info).catch(err => this._handleDiscordError(err));
    };

    _handleDiscordError(err) {
        console.error("Error occured while sending message to discord:");
        console.error(err);

        if (!(err instanceof DiscordAPIError)) {
            return;
        }

        if (this.constructor._disableCodes.includes(err.code)) {
            if (typeof this.getDisabledMessage === "function") {
                const disabledMessage = this.getDisabledMessage();
                console.info(disabledMessage);
            }

            this.close();
        }
    }

    _startSendLoop() {
        if (this.sendDelayed) {
            this._sendTimer = setInterval(this._sendLogs, this.sendInterval);
        }
    }

    _stopSendLoop() {
        if (this._sendTimer === null) {
            return;
        }

        clearInterval(this._sendTimer);
        this._sendTimer = null;
    }
}

export default BaseDiscordTransport;
