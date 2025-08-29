import { WebhookClient, RESTJSONErrorCodes } from "discord.js";

import BaseDiscordTransport from "./BaseDiscordTransport.js";

import Util from "../../util/Util.js";

import LoggerError from "../../errors/LoggerError.js";

class WebhookTransport extends BaseDiscordTransport {
    static $name = "discord.webhook";

    constructor(opts) {
        super(opts);

        let webhook = opts.webhook;

        if (typeof webhook !== "object") {
            webhook = this._getWebhook(opts.url);
        } else {
            this.webhookUrl = webhook.url;
            this.webhookId = webhook.id;
            this.webhookToken = webhook.token;
        }

        this.webhook = webhook;
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

    static _urlRegex = /^https:\/\/discord\.com\/api\/webhooks\/(?<id>\d+)\/(?<token>[\w_-]+)$/;
    static _disableCodes = [RESTJSONErrorCodes.InvalidWebhookToken, RESTJSONErrorCodes.UnknownWebhook];

    _getWebhook(url) {
        if (typeof url !== "string" || Util.empty(url)) {
            throw new LoggerError("If a webhook object wasn't provided, a webhook url must be provided instead");
        }

        const match = url.match(WebhookTransport._urlRegex);

        if (match === null) {
            throw new LoggerError("Invalid webhook url", url);
        }

        const { id, token } = match.groups,
            webhook = new WebhookClient({ id, token });

        this.webhookUrl = url;
        this.webhookId = id;
        this.webhookToken = token;

        return webhook;
    }
}

export default WebhookTransport;
