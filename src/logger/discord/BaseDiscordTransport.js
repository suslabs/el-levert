import Transport from "winston-transport";
import { EmbedBuilder, codeBlock } from "discord.js";

import { EmbedColors, defaultColor } from "./EmbedColors.js";
import LoggerError from "../../errors/LoggerError.js";

import Util from "../../util/Util.js";

const msgCharLimit = 2000,
    embedCharLimit = 4096;

class BaseDiscordTransport extends Transport {
    constructor(opts) {
        super(opts);

        if (typeof this.sendLog !== "function") {
            throw new LoggerError("Discord transport must have a sendLog function");
        }

        this.initialized = false;
        this.buffer = [];

        const charLimit = opts.charLimit ?? embedCharLimit;
        this.charLimit = Util.clamp(charLimit, 0, embedCharLimit);

        this.sendInterval = opts.sendInterval ?? 2 / Util.durationSeconds.milli;
        this.sendDelayed = this.sendInterval > 0;

        if (typeof this.init === "function") {
            this.init(opts);
        } else {
            this.initialized = true;
        }

        this.startSendLoop();
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
            this.logToDiscord(info).catch(err => {
                console.error("Error occured while sending message to Discord:", err);
            });
        }

        callback();
    }

    async logToDiscord(info) {
        let content = "",
            fileContent = "",
            embed = new EmbedBuilder();

        let totalEmbedChars = 0;

        embed.setTitle(Util.capitalize(info.level));
        totalEmbedChars += info.level.length;

        const color = EmbedColors[info.level] ?? defaultColor;
        embed.setColor(color);

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

        if (typeof embed.data.fields !== "undefined") {
            totalEmbedChars += embed.data.fields.reduce((sum, val) => {
                const { name, value } = val;
                return sum + name.length + value.length;
            }, 0);
        }

        if (typeof info.timestamp !== "undefined") {
            embed.setTimestamp(info.timestamp);
            totalEmbedChars += info.timestamp.length;
        }

        if (info.message.length < this.charLimit - totalEmbedChars) {
            const formattedMessage = codeBlock(info.message);
            embed.setDescription(formattedMessage);

            totalEmbedChars += formattedMessage.length;
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

        await this.sendLog(out);
    }

    sendLogs() {
        const info = this.buffer.shift();

        if (typeof info === "undefined") {
            return;
        }

        this.logToDiscord(info).catch(err => {
            console.error("Error occured while sending message to discord:", err);
        });
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
        this.stopSendLoop();
    }
}

export default BaseDiscordTransport;
