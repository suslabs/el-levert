import { WebhookClient, RESTJSONErrorCodes } from "discord.js";

import BaseDiscordTransport from "./BaseDiscordTransport.js";

import LoggerError from "../../errors/LoggerError.js";

const urlRegex = /^https:\/\/discord\.com\/api\/webhooks\/(?<id>\d+)\/(?<token>[\w_-]+)$/;

class WebhookTransport extends BaseDiscordTransport {
    static name = "discord.webhook";

    constructor(opts) {
        super({
            name: WebhookTransport.name,
            ...opts
        });

        let webhook = opts.webhook;

        if (typeof webhook === "undefined") {
            webhook = this.getWebhook(opts.url);
        } else {
            this.webhookUrl = webhook.url;
            this.webhookId = webhook.id;
            this.webhookToken = webhook.token;
        }

        this.webhook = webhook;
        this.disableCodes = [RESTJSONErrorCodes.InvalidWebhookToken, RESTJSONErrorCodes.UnknownWebhook];
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

        this.webhookUrl = url;
        this.webhookId = id;
        this.webhookToken = token;

        return webhook;
    }

    async sendLog(log) {
        await this.webhook.send(log);
    }

    getDisabledMessage() {
        return "Disabled webhook transport.";
    }

    onClose() {
        this.webhook.destroy();
    }
}

export default WebhookTransport;
