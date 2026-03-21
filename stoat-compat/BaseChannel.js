import { Buffer, File } from "node:buffer";

import { Client } from "./Client.js";

import { AttachmentBuilder } from "./builders.js";
import { PermissionsBitField } from "./PermissionsBitField.js";

import { RESTJSONErrorCodes, ChannelType } from "./constants.js";
import { DiscordAPIError } from "./errors.js";

import Collection from "./Collection.js";

class BaseChannel {
    constructor(raw, client) {
        this._raw = raw;
        this._client = client;

        this.id = raw?.id ?? raw?._id;
        this.name = raw?.name ?? raw?.displayName ?? "unknown";

        const isDm = ["DirectMessage", "SavedMessages"].includes(raw?.type);

        this.type = isDm ? ChannelType.DM : ChannelType.GuildText;
        this.recipientId = raw?.recipient?.id ?? raw?.userId ?? raw?.recipientId ?? null;

        this.guild = isDm ? null : Client._wrapGuild(raw?.server, client);
        this.parent = null;

        this.messages = {
            cache: new Collection(),
            fetch: this._fetchMessages.bind(this)
        };
    }

    memberPermissions() {
        return new PermissionsBitField();
    }

    sendTyping() {
        return Promise.resolve();
    }

    async send(data) {
        const payload = await BaseChannel._normalizeOutgoing(data, this._client);

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
            const rawMessage = await this._raw.sendMessage(body),
                message = Client._wrapMessage(rawMessage, this._client, this);

            this.messages.cache.set(message.id, message);
            return message;
        } catch (err) {
            throw Client._toDiscordError(err, {
                accessCode: RESTJSONErrorCodes.CannotSendMessagesInNonTextChannel,
                message: "Could not send message"
            });
        }
    }

    async fetchMessage(messageId, options = {}) {
        messageId = Client._normalizeId(messageId);

        if (messageId == null) {
            throw new DiscordAPIError("Invalid message id", RESTJSONErrorCodes.UnknownMessage);
        }

        if (!options.force) {
            const cached = this.messages.cache.get(messageId);

            if (cached != null) {
                return cached;
            }
        }

        try {
            const rawMessage = await this._raw.fetchMessage(messageId),
                message = Client._wrapMessage(rawMessage, this._client, this);

            this.messages.cache.set(message.id, message);
            return message;
        } catch (err) {
            throw Client._toDiscordError(err, {
                notFoundCode: RESTJSONErrorCodes.UnknownMessage,
                accessCode: RESTJSONErrorCodes.MissingAccess,
                message: "Message not found"
            });
        }
    }

    static _normalizeEmbed(embed) {
        const data = embed?.data ?? embed;

        if (data == null || typeof data !== "object") {
            return null;
        }

        const fieldLines = [];

        for (const field of data.fields ?? []) {
            if (field?.name != null) {
                fieldLines.push(String(field.name));
            }

            if (field?.value != null) {
                fieldLines.push(String(field.value));
            }
        }

        const description = [data.description, fieldLines.length > 0 ? fieldLines.join("\n") : null, data.footer?.text]
            .map(part => (part == null ? "" : String(part).trim()))
            .filter(Boolean)
            .join("\n\n");

        let colour = null;

        if (typeof data.colour === "string") {
            colour = data.colour;
        } else if (typeof data.color === "number") {
            colour = `#${data.color.toString(16).padStart(6, "0")}`;
        } else if (typeof data.color === "string") {
            colour = data.color;
        }

        const out = {
            icon_url:
                data.icon_url ??
                data.iconURL ??
                data.author?.icon_url ??
                data.author?.iconURL ??
                data.footer?.icon_url ??
                data.footer?.iconURL ??
                null,
            url: data.url ?? null,
            title: data.title ?? data.author?.name ?? null,
            description: description.length > 0 ? description : null,
            media: data.media ?? data.image?.url ?? data.image ?? data.thumbnail?.url ?? data.thumbnail ?? null,
            colour
        };

        return Object.values(out).some(value => value != null) ? out : null;
    }

    static _normalizeBinarySource(source, options = {}) {
        if (source instanceof File) {
            return {
                name: options.name ?? source.name ?? "file.bin",
                data: source,
                contentType: source.type ?? options.contentType ?? "application/octet-stream"
            };
        }

        if (typeof Blob !== "undefined" && source instanceof Blob) {
            return {
                name: options.name ?? "file.bin",
                data: source,
                contentType: source.type ?? options.contentType ?? "application/octet-stream"
            };
        }

        if (Buffer.isBuffer(source)) {
            return {
                name: options.name ?? "file.bin",
                data: source,
                contentType: options.contentType ?? "application/octet-stream"
            };
        }

        return null;
    }

    static _normalizeToFilePayload(file) {
        if (file == null) {
            return null;
        }

        if (file instanceof AttachmentBuilder) {
            return this._normalizeBinarySource(file.attachment, {
                name: file.name,
                contentType: file.contentType
            });
        }

        if (file?.attachment != null) {
            return this._normalizeBinarySource(file.attachment, {
                name: file?.name,
                contentType: file?.contentType
            });
        }

        return this._normalizeBinarySource(file);
    }

    static _toUploadFile(filePayload) {
        if (filePayload.data instanceof File) {
            return filePayload.data;
        }

        return new File([filePayload.data], filePayload.name ?? "file.bin", {
            type: filePayload.contentType ?? "application/octet-stream"
        });
    }

    static _normalizeOutgoingSync(data) {
        if (typeof data === "string") {
            return {
                content: data,
                embeds: [],
                files: [],
                replyTo: null,
                replyMention: true
            };
        }

        if (data == null || typeof data !== "object") {
            return {
                content: "",
                embeds: [],
                files: [],
                replyTo: null,
                replyMention: true
            };
        }

        const files = Array.isArray(data.files) ? data.files : [];

        if (!Array.isArray(data.files) && data.file != null) {
            files.push(data.file);
        }

        return {
            content: data.content ?? "",
            embeds: Array.isArray(data.embeds) ? data.embeds.filter(Boolean) : [],
            files,
            replyTo: data.replyTo ?? null,
            replyMention: data.replyMention ?? true
        };
    }

    static async _normalizeOutgoing(data, client) {
        const out = this._normalizeOutgoingSync(data),
            embeds = out.embeds.map(this._normalizeEmbed).filter(Boolean),
            filePayloads = out.files.map(this._normalizeToFilePayload.bind(this));

        if (filePayloads.some(payload => payload == null)) {
            throw new DiscordAPIError("Unsupported file payload", RESTJSONErrorCodes.InvalidFormBodyOrContentType);
        }

        const attachmentIds = await Promise.all(
            filePayloads.map(async filePayload => {
                try {
                    return await client._raw.uploadFile("attachments", this._toUploadFile(filePayload));
                } catch (err) {
                    throw new DiscordAPIError(
                        err?.message ?? "Attachment upload failed",
                        RESTJSONErrorCodes.InvalidFormBodyOrContentType
                    );
                }
            })
        );

        return {
            content: out.content,
            replyTo: out.replyTo,
            replyMention: out.replyMention,
            attachments: attachmentIds,
            embeds
        };
    }

    async _fetchMessages(fetchOptions, options = {}) {
        if (typeof fetchOptions === "string") {
            return await this.fetchMessage(fetchOptions, options);
        }

        try {
            const rawMessages = await this._raw.fetchMessages(fetchOptions ?? {}),
                wrapped = rawMessages.map(message => Client._wrapMessage(message, this._client, this));

            for (const message of wrapped) {
                this.messages.cache.set(message.id, message);
            }

            return Collection.fromArray(wrapped);
        } catch (err) {
            throw Client._toDiscordError(err, {
                notFoundCode: RESTJSONErrorCodes.UnknownMessage,
                accessCode: RESTJSONErrorCodes.MissingAccess,
                message: "Could not fetch messages"
            });
        }
    }
}

export { BaseChannel };
