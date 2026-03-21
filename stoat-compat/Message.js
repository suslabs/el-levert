import { Client } from "./Client.js";

import { MessageType } from "./constants.js";

import Collection from "./Collection.js";

class Message {
    constructor(raw, client, channel) {
        this.mentions = {
            everyone: false,
            users: new Collection(),
            roles: new Collection(),
            members: new Collection(),
            channels: new Collection(),
            crosspostedChannels: new Collection(),
            repliedUser: null
        };

        this.stickers = new Collection();
        this._applyRaw(raw, client, channel);
    }

    async reply(data) {
        let payload;

        if (data != null && typeof data === "object") {
            payload = { ...data };
        } else {
            payload = {
                content: data
            };
        }

        payload.replyTo = this.id;
        payload.replyMention = this._client?.options?.allowedMentions?.repliedUser ?? true;

        return await this.channel.send(payload);
    }

    async delete() {
        if (typeof this._raw?.delete === "function") {
            return await this._raw.delete();
        }

        return null;
    }

    async react(emoji) {
        if (typeof this._raw?.react === "function") {
            await this._raw.react(emoji);
        }

        return {
            emoji,
            users: {
                remove: async () => {
                    if (typeof this._raw?.unreact === "function") {
                        await this._raw.unreact(emoji);
                    }
                }
            }
        };
    }

    toString() {
        return this.content;
    }

    static _toTimestamp(value, nullable = false) {
        if (value == null) {
            return nullable ? null : Date.now();
        }

        if (value instanceof Date) {
            return value.getTime();
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return nullable ? null : Date.now();
        }

        return date.getTime();
    }

    static _wrapAttachment(raw) {
        if (raw == null) {
            return null;
        }

        return {
            id: raw.id ?? raw._id,
            name: raw.filename ?? raw.name ?? "attachment",
            size: raw.size,
            contentType: raw.contentType ?? raw.content_type ?? null,
            url: raw.createFileURL?.() ?? raw.previewUrl ?? raw.url ?? ""
        };
    }

    _applyRaw(raw, client, channel) {
        this._raw = raw;
        this._client = client;

        this.id = raw?.id ?? raw?._id ?? this.id;

        this.channel =
            channel ??
            Client._wrapChannel(
                raw?.channel ?? (raw?.channelId ? client?._raw?.channels?.get(raw.channelId) : null),
                client
            ) ??
            this.channel ??
            null;
        this.channelId = this.channel?.id ?? raw?.channelId ?? raw?.channel ?? this.channelId ?? null;

        this.guildId = this.channel?.guild?.id ?? null;
        this.author = Client._wrapUser(raw?.author ?? raw?.user ?? raw?.member?.user, client) ?? this.author ?? null;

        this.content = raw?.content ?? this.content ?? "";
        this.system = false;

        this.createdTimestamp = Message._toTimestamp(raw?.createdAt ?? this.createdTimestamp);
        this.editedTimestamp = Message._toTimestamp(raw?.editedAt, true);

        this.embeds = Array.isArray(raw?.embeds) ? raw.embeds : [];

        const attachments = (raw?.attachments ?? []).map(Message._wrapAttachment).filter(Boolean);
        this.attachments = Collection.fromArray(attachments);

        this.reference = {
            messageId: raw?.replyIds?.[0] ?? raw?.reference?.messageId ?? this.reference?.messageId ?? null
        };

        this.type = this.reference.messageId ? MessageType.Reply : MessageType.Default;
    }
}

export { Message };
