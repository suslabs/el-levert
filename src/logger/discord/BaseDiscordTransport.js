import Transport from "winston-transport";
import { EmbedBuilder, TimestampStyles, codeBlock, time, DiscordAPIError } from "discord.js";

import { EmbedColors, defaultColor } from "./EmbedColors.js";
import LoggerError from "../../errors/LoggerError.js";

import Util from "../../util/Util.js";

function getEmbedColor(level) {
    return EmbedColors[level] ?? defaultColor;
}

const msgCharLimit = 2000,
    embedCharLimit = 4096;

class BaseDiscordTransport extends Transport {
    constructor(opts) {
        super(opts);

        if (typeof this.constructor.name === "undefined") {
            throw new LoggerError("Discord transport must have a name");
        }

        if (typeof this.sendLog !== "function") {
            throw new LoggerError("Chuld class must have a sendLog function");
        }

        this.initialized = false;
        this.buffer = [];
        this.disableCodes = [];

        const charLimit = opts.charLimit ?? embedCharLimit;
        this.charLimit = Util.clamp(charLimit, 0, embedCharLimit);

        this.name = opts.name;
        this.sendInterval = opts.sendInterval ?? 0;
        this.client = opts.client;

        if (typeof this.init === "function") {
            this.init(opts);
        } else {
            this.initialized = true;
        }

        this.startSendLoop();
    }

    get sendDelayed() {
        return this.sendInterval > 0;
    }

    log(info, callback) {
        setImmediate(_ => {
            this.emit("logged", info);
        });

        if (!this.initialized || info?.discord === false) {
            callback();
            return;
        }

        if (this.sendDelayed) {
            this.buffer.push(info);
        } else {
            this.logToDiscord(info).catch(err => this.discordErrorHandler(err));
        }

        callback();
    }

    formatLog(info) {
        let content = "",
            fileContent = "",
            embed = new EmbedBuilder();

        embed.setTitle(Util.capitalize(info.level));
        embed.setColor(getEmbedColor(info.level));

        if (typeof info.stack !== "undefined") {
            if (info.stack.length < msgCharLimit) {
                const formattedStack = codeBlock("js", info.stack);
                content += formattedStack;
            } else {
                fileContent += `--- Error stack:\n${info.stack}`;
            }
        }

        if (typeof info.meta !== "undefined") {
            for (const [key, value] of Object.entries(info.meta)) {
                embed.addFields({
                    name: key,
                    value
                });
            }
        }

        if (typeof info.service !== "undefined") {
            embed.addFields({
                name: "service",
                value: info.service
            });
        }

        if (typeof info.timestamp !== "undefined") {
            const date = new Date(info.timestamp),
                timestamp = Math.floor(date.getTime() * Util.durationSeconds.milli),
                formattedTimestamp = time(timestamp, TimestampStyles.RelativeTime);

            embed.setTimestamp(date);
            embed.setTitle(`${embed.data.title} | ${formattedTimestamp}`);
        }

        if (typeof this.client !== "undefined") {
            const username = this.client.user.displayName,
                avatar = this.client.user.displayAvatarURL();

            embed.setAuthor({
                name: username,
                iconURL: avatar
            });
        }

        const totalEmbedChars = Util.getEmbedSize(embed);

        if (info.message.length < this.charLimit - totalEmbedChars) {
            const formattedMessage = codeBlock(info.message);
            embed.setDescription(formattedMessage);
        } else {
            fileContent += `--- Log message:\n${info.message}`;
        }

        let out = {
            content,
            embeds: [embed]
        };

        if (typeof fileContent.length > 0) {
            out = {
                ...out,
                ...Util.getFileAttach(fileContent, "log.txt")
            };
        }

        return out;
    }

    async logToDiscord(info) {
        const out = this.formatLog(info);
        await this.sendLog(out);
    }

    sendLogs() {
        if (!this.initialized) {
            return;
        }

        const info = this.buffer.shift();

        if (typeof info === "undefined") {
            return;
        }

        this.logToDiscord(info).catch(err => this.discordErrorHandler(err));
    }

    discordErrorHandler(err) {
        console.error("Error occured while sending message to discord:", err);

        if (!(err instanceof DiscordAPIError)) {
            return;
        }

        if (this.disableCodes.includes(err.code)) {
            if (typeof this.getDisabledMessage === "function") {
                const disabledMessage = this.getDisabledMessage();
                console.info(disabledMessage);
            }

            this.close();
        }
    }

    startSendLoop() {
        if (!this.sendDelayed) {
            return;
        }

        const sendFunc = this.sendLogs.bind(this);
        this.sendTimer = setInterval(sendFunc, this.sendInterval);
    }

    stopSendLoop() {
        if (typeof this.sendTimer === "undefined") {
            return;
        }

        clearInterval(this.sendTimer);
        delete this.sendTimer;
    }

    close() {
        if (typeof this.onClose === "function") {
            this.onClose();
        }

        this.initialized = false;
        this.stopSendLoop();
    }
}

export default BaseDiscordTransport;
