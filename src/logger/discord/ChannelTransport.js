import { RESTJSONErrorCodes } from "discord.js";

import BaseDiscordTransport from "./BaseDiscordTransport.js";

import Util from "../../util/Util.js";
import LoggerError from "../../errors/LoggerError.js";

class ChannelTransport extends BaseDiscordTransport {
    static $name = "discord.channel";

    constructor(opts) {
        super({
            sendInterval: 2 / Util.durationSeconds.milli,
            ...opts
        });

        let channel = opts.channel;

        if (typeof channel === "undefined") {
            channel = this.getChannel(opts.channelId);
        } else {
            this.channelId = channel.id;
        }

        this.channel = channel;
        this.disableCodes = [RESTJSONErrorCodes.CannotSendMessagesInNonTextChannel];
    }

    getChannel(id) {
        if (typeof this.client === "undefined" || typeof id === "undefined" || id.length < 1) {
            throw new LoggerError(
                "If a channel object wasn't provided, a client object and a channel id must be provided instead"
            );
        }

        this.channelId = id;
        const channel = this.client.channels.cache.get(id);

        if (typeof channel === "undefined") {
            throw new LoggerError("Channel not found");
        }

        return channel;
    }

    async sendLog(log) {
        await this.channel.send(log);
    }

    getDisabledMessage() {
        return "Disabled channel transport.";
    }
}

export default ChannelTransport;
