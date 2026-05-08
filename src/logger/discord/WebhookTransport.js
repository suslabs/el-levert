import { WebhookClient, RESTJSONErrorCodes } from "discord.js";

import BaseDiscordTransport from "./BaseDiscordTransport.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";

import LoggerError from "../../errors/LoggerError.js";

class WebhookTransport extends BaseDiscordTransport {
    static $name = "discord.webhook";

    constructor(opts) {
        super(opts);

        let webhook = opts.webhook;

        if (!TypeTester.isObject(webhook)) {
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

    static _urlRegex = /^https?:\/\/[^/]+(?:\/api)?\/webhooks\/(?<id>[A-Za-z0-9]+)\/(?<token>[A-Za-z0-9_-]+)$/i;
    static _disableCodes = [RESTJSONErrorCodes.InvalidWebhookToken, RESTJSONErrorCodes.UnknownWebhook];

    _getWebhook(url) {
        if (!Util.nonemptyString(url)) {
            throw new LoggerError("If a webhook object wasn't provided, a webhook url must be provided instead");
        }

        const match = url.match(WebhookTransport._urlRegex);

        if (match === null) {
            throw new LoggerError("Invalid webhook url", url);
        }

        const { id, token } = match.groups,
            webhook = new WebhookClient({ id, token, client: this.client });

        this.webhookUrl = url;
        this.webhookId = id;
        this.webhookToken = token;

        return webhook;
    }
}

export default WebhookTransport;
