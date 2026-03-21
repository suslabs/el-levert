import { API as StoatApi } from "stoat-api";

import { Client } from "./Client.js";
import { BaseChannel } from "./BaseChannel.js";

import { RESTJSONErrorCodes } from "./constants.js";
import { DiscordAPIError } from "./errors.js";

class WebhookClient {
    constructor({ id, token, client = null, baseURL = null }) {
        this.id = id;
        this.token = token;
        this._client = client;
        this.baseURL = baseURL ?? process.env.REVOLT_API_URL ?? "https://api.revolt.chat";
        this.url = `${this.baseURL}/webhooks/${id}/${token}`;

        this._api = client?._raw?.api ?? new StoatApi({ baseURL: this.baseURL });
    }

    async send(data) {
        let payload;

        if (this._client != null) {
            payload = await BaseChannel._normalizeOutgoing(data, this._client);
        } else {
            const out = BaseChannel._normalizeOutgoingSync(data);

            if (out.files.length > 0) {
                throw new DiscordAPIError(
                    "Webhook file uploads require an authenticated client",
                    RESTJSONErrorCodes.InvalidFormBodyOrContentType
                );
            }

            payload = {
                content: out.content,
                replyTo: out.replyTo,
                replyMention: out.replyMention,
                attachments: [],
                embeds: out.embeds.map(BaseChannel._normalizeEmbed).filter(Boolean)
            };
        }

        if (
            (payload.content ?? "").trim().length === 0 &&
            payload.attachments.length === 0 &&
            payload.embeds.length === 0
        ) {
            throw new DiscordAPIError("Cannot send an empty message", RESTJSONErrorCodes.CannotSendAnEmptyMessage);
        }

        const body = {
            content: payload.content,
            ...(payload.attachments.length > 0 ? { attachments: payload.attachments } : {}),
            ...(payload.embeds.length > 0 ? { embeds: payload.embeds } : {})
        };

        if (payload.replyTo != null) {
            body.replies = [
                {
                    id: payload.replyTo,
                    mention: payload.replyMention
                }
            ];
        }

        try {
            const raw = await this._api.post(`/webhooks/${this.id}/${this.token}`, body);
            return Client._wrapMessage(raw, this._client);
        } catch (err) {
            throw Client._toDiscordError(err, {
                notFoundCode: RESTJSONErrorCodes.UnknownWebhook,
                accessCode: RESTJSONErrorCodes.InvalidWebhookToken,
                message: "Webhook send failed"
            });
        }
    }

    destroy() {
        return;
    }
}

export { WebhookClient };
