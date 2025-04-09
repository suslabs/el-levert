import Transport from "winston-transport";
import { EmbedBuilder, TimestampStyles, codeBlock, time, DiscordAPIError } from "discord.js";

import { EmbedColors, defaultColor } from "./EmbedColors.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import DiscordUtil from "../../util/DiscordUtil.js";

import LoggerError from "../../errors/LoggerError.js";

class BaseDiscordTransport extends Transport {
    constructor(opts) {
        super(opts);

        if (typeof this.constructor.$name !== "string") {
            throw new LoggerError("Discord transport must have a default name");
        }

        if (typeof this.sendLog !== "function") {
            throw new LoggerError("Child class must have a sendLog function");
        }

        const charLimit = opts.charLimit ?? DiscordUtil.embedCharLimit;
        this.charLimit = Util.clamp(charLimit, 0, DiscordUtil.embedCharLimit);

        this.name = opts.name ?? this.constructor.$name;
        this.sendInterval = opts.sendInterval ?? 0;

        this.client = opts.client;
        this._hasClient = opts.client != null;

        this.initialized = false;

        if (typeof this.init === "function") {
            this.init(opts);
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
            this._logToDiscord(info).catch(err => this._discordErrorHandler(err));
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
            if (TypeTester.overSizeLimits(info.stack, DiscordUtil.msgCharLimit)) {
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
                timestamp = Math.floor(date.getTime() * Util.durationSeconds.milli),
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
            embeds: [embed]
        };

        if (!Util.empty(fileContent)) {
            Object.assign(out, DiscordUtil.getFileAttach(fileContent, "log.txt"));
        }

        return out;
    }

    async _logToDiscord(info) {
        const out = this._formatLog(info);
        await this.sendLog(out);
    }

    _sendLogs() {
        if (!this.initialized) {
            return;
        }

        const info = this._buffer.shift();

        if (typeof info === "undefined") {
            return;
        }

        this._logToDiscord(info).catch(err => this._discordErrorHandler(err));
    }

    _discordErrorHandler(err) {
        console.error("Error occured while sending message to discord:", err);

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
        if (!this.sendDelayed) {
            return;
        }

        const sendFunc = this._sendLogs.bind(this);
        this._sendTimer = setInterval(sendFunc, this.sendInterval);
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
