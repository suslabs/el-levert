import BaseDiscordTransport from "./BaseDiscordTransport.js";

import LoggerError from "../../errors/LoggerError.js";

class ChannelTransport extends BaseDiscordTransport {
    constructor(opts) {
        super(opts);

        let channel = opts.channel;

        if (typeof channel === "undefined") {
            const { client, channelId } = opts;
            channel = this.getChannel(client, channelId);
        }

        this.channel = channel;
    }

    getChannel(client, id) {
        if (typeof client === "undefined" || typeof id === "undefined" || id.length < 1) {
            throw new LoggerError(
                "If a channel object wasn't provided, a client object and a channel id must be provided instead"
            );
        }

        this.client = client;
        this.channelId = id;

        const channel = client.channels.cache.get(id);

        if (typeof channel === "undefined") {
            throw new LoggerError("Channel not found");
        }

        return channel;
    }

    async sendLog(log) {
        await this.channel.send(log);
    }
}

export default ChannelTransport;
