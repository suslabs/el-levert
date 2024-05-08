import { WebhookClient, DiscordAPIError, RESTJSONErrorCodes } from "discord.js";

import BaseDiscordTransport from "./BaseDiscordTransport.js";

import LoggerError from "../../errors/LoggerError.js";

const urlRegex = /^https:\/\/discord\.com\/api\/webhooks\/(?<id>\d+)\/(?<token>[\w_-]+)$/;

class WebhookTransport extends BaseDiscordTransport {
    constructor(opts) {
        super(opts);

        let webhook = opts.webhook;

        if (typeof webhook === "undefined") {
            webhook = this.getWebhook(opts.url);
        }

        this.webhook = webhook;
    }

    getWebhook(url) {
        if (typeof url === "undefined" || url.length < 1) {
            throw new LoggerError("If a webhook object wasn't provided, a webhook url must be provided instead");
        }

        const match = url.match(urlRegex);

        if (match === null) {
            throw new LoggerError("Invalid webhook url");
        }

        const { id, token } = match.groups,
            webhook = new WebhookClient({ id, token });

        return webhook;
    }

    async sendLog(log) {
        await this.webhook.send(log);
    }
}

export default WebhookTransport;
