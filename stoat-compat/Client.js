import { EventEmitter } from "node:events";

import { Client as StoatClient } from "stoat.js";

import { Guild } from "./Guild.js";
import { BaseChannel } from "./BaseChannel.js";
import { User } from "./User.js";
import { GuildMember } from "./GuildMember.js";
import { Message } from "./Message.js";

import { RESTJSONErrorCodes, ActivityType, Events } from "./constants.js";
import { DiscordAPIError } from "./errors.js";

import Collection from "./Collection.js";

class Client extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            allowedMentions: {
                repliedUser: true,
                parse: []
            },
            ...options
        };

        this._raw = new StoatClient(
            {
                baseURL: options.baseURL ?? process.env.REVOLT_API_URL ?? "https://api.revolt.chat",
                autoReconnect: options.autoReconnect ?? true,
                partials: false,
                syncUnreads: false,
                messageRewrites: true,
                debug: options.debug ?? false
            },
            {
                ws: options.wsURL ?? process.env.REVOLT_WS_URL ?? "wss://ws.revolt.chat",
                app: options.appURL ?? process.env.REVOLT_APP_URL ?? "https://app.revolt.chat"
            }
        );

        this.channels = {
            cache: new Collection(),
            fetch: this._fetchChannel.bind(this)
        };

        this.guilds = {
            cache: new Collection(),
            fetch: this._fetchGuild.bind(this)
        };

        this.users = {
            cache: new Collection(),
            fetch: this._fetchUser.bind(this)
        };

        this._memberCache = new Map();
        this._messageCache = new Map();

        this.user = null;

        this._bindEvents();
    }

    async login(token) {
        await this._raw.loginBot(token);
    }

    destroy() {
        this._raw.events?.disconnect?.();
        this._raw.removeAllListeners?.();
        this.removeAllListeners();
    }

    static _normalizeId(input) {
        if (input == null) {
            return null;
        }

        if (typeof input === "object") {
            input = input.id ?? input._id ?? input.user?.id ?? input.user?._id ?? null;
        }

        if (input == null) {
            return null;
        }

        let id = String(input).trim();

        const mention = id.match(/^<(?:@!?|#)([A-Za-z0-9]+)>$/);

        if (mention) {
            id = mention[1];
        }

        return id.length > 0 ? id : null;
    }

    static _isNotFoundError(err) {
        if (err == null) {
            return false;
        }

        const message = String(err?.message ?? err).toLowerCase(),
            status = err?.status ?? err?.response?.status ?? err?.code;

        return status === 404 || message.includes("404") || message.includes("not found");
    }

    static _isAccessError(err) {
        if (err == null) {
            return false;
        }

        const message = String(err?.message ?? err).toLowerCase(),
            status = err?.status ?? err?.response?.status ?? err?.code;

        return status === 401 || status === 403 || message.includes("forbidden") || message.includes("access");
    }

    static _toDiscordError(err, options = {}) {
        if (err instanceof DiscordAPIError) {
            return err;
        }

        const notFoundCode = options.notFoundCode ?? null,
            accessCode = options.accessCode ?? null,
            fallbackMessage = options.message ?? "Request failed";

        if (notFoundCode != null && this._isNotFoundError(err)) {
            return new DiscordAPIError(fallbackMessage, notFoundCode);
        }

        if (accessCode != null && this._isAccessError(err)) {
            return new DiscordAPIError(fallbackMessage, accessCode);
        }

        return new DiscordAPIError(err?.message ?? fallbackMessage, err?.code ?? null);
    }

    static _wrapUser(raw, client) {
        if (raw == null) {
            return null;
        }

        if (raw instanceof User) {
            return raw;
        }

        const id = raw.id ?? raw._id;

        if (id == null) {
            return null;
        }

        const cached = client?.users?.cache?.get(id);

        if (cached != null) {
            cached._raw = raw;
            cached.username = raw?.username ?? cached.username;
            cached.displayName = raw?.displayName ?? cached.displayName ?? cached.username;

            return cached;
        }

        const user = new User(raw, client);
        client?.users?.cache?.set(user.id, user);

        return user;
    }

    static _wrapGuild(raw, client) {
        if (raw == null) {
            return null;
        }

        if (raw instanceof Guild) {
            return raw;
        }

        const id = raw.id ?? raw._id;

        if (id == null) {
            return null;
        }

        const cached = client?.guilds?.cache?.get(id);

        if (cached != null) {
            cached._raw = raw;
            cached.name = raw?.name ?? cached.name;

            return cached;
        }

        const guild = new Guild(raw, client);
        client?.guilds?.cache?.set(guild.id, guild);

        return guild;
    }

    static _wrapMember(raw, guild, client) {
        if (raw == null) {
            return null;
        }

        if (raw instanceof GuildMember) {
            return raw;
        }

        const serverId = guild?.id ?? raw?.id?.server ?? raw?._raw?.id?.server ?? null,
            userId = raw?.user?.id ?? raw?.id?.user ?? raw?._raw?.id?.user ?? null;

        if (serverId != null && userId != null) {
            const key = `${serverId}:${userId}`,
                cached = client?._memberCache?.get(key);

            if (cached != null) {
                cached._raw = raw;
                cached.guild = guild ?? cached.guild;
                cached.user = this._wrapUser(raw?.user ?? raw, client) ?? cached.user;
                cached.id = cached.user?.id ?? cached.id;
                cached.username = cached.user?.username ?? cached.username;
                cached.displayName = cached.user?.displayName ?? cached.displayName;
                cached.nickname = raw?.nickname ?? raw?.nick ?? cached.nickname;

                return cached;
            }

            const member = new GuildMember(raw, guild, client);
            client?._memberCache?.set(key, member);

            return member;
        }

        return new GuildMember(raw, guild, client);
    }

    static _wrapChannel(raw, client) {
        if (raw == null) {
            return null;
        }

        if (raw instanceof BaseChannel) {
            return raw;
        }

        const id = raw.id ?? raw._id;

        if (id == null) {
            return null;
        }

        const cached = client?.channels?.cache?.get(id);

        if (cached != null) {
            cached._raw = raw;
            cached.name = raw?.name ?? raw?.displayName ?? cached.name;

            return cached;
        }

        const channel = new BaseChannel(raw, client);
        client?.channels?.cache?.set(channel.id, channel);

        return channel;
    }

    static _wrapMessage(raw, client, channel) {
        if (raw == null) {
            return null;
        }

        if (raw instanceof Message) {
            return raw;
        }

        if (typeof raw === "string") {
            const existing = client?._messageCache?.get(raw);

            if (existing != null) {
                return existing;
            }

            const message = new Message({ id: raw }, client, channel);
            client?._messageCache?.set(message.id, message);
            return message;
        }

        const id = raw?.id ?? raw?._id,
            cached = id != null ? client?._messageCache?.get(id) : null;

        let message;

        if (cached != null) {
            cached._applyRaw(raw, client, channel);
            message = cached;
        } else {
            message = new Message(raw, client, channel);

            if (message?.id != null) {
                client?._messageCache?.set(message.id, message);
            }
        }

        if (message.channel?.messages?.cache instanceof Collection) {
            message.channel.messages.cache.set(message.id, message);
        }

        return message;
    }

    _bindEvents() {
        this._raw.on("ready", () => {
            this.user = Client._wrapUser(this._raw.user, this);

            if (this.user != null) {
                this.user.setActivity = (text, opts = {}) => ({
                    activities: [
                        {
                            type: opts.type ?? ActivityType.Playing,
                            name: text
                        }
                    ]
                });
            }

            this.emit(Events.ClientReady, this);
        });

        this._raw.on("messageCreate", rawMessage => {
            this.emit(Events.MessageCreate, Client._wrapMessage(rawMessage, this));
        });

        this._raw.on("messageUpdate", (rawMessage, previousRawMessage) => {
            this.emit(
                Events.MessageUpdate,
                Client._wrapMessage(previousRawMessage, this),
                Client._wrapMessage(rawMessage, this)
            );
        });

        this._raw.on("messageDelete", rawMessage => {
            const message = Client._wrapMessage(rawMessage, this);
            this.emit(Events.MessageDelete, message);

            if (message?.id != null) {
                this._messageCache.delete(message.id);
                message?.channel?.messages?.cache?.delete?.(message.id);
            }
        });

        this._raw.on("error", err => {
            this.emit(Events.Error, err);
        });
    }

    async _fetchChannel(id, options = {}) {
        if (typeof id === "object") {
            return Client._wrapChannel(id, this);
        }

        id = Client._normalizeId(id);

        if (id == null) {
            return null;
        }

        const force = options?.force ?? false,
            cached = this.channels.cache.get(id);

        if (!force && cached != null) {
            return cached;
        }

        try {
            const rawChannel = await this._raw.channels.fetch(id);
            return Client._wrapChannel(rawChannel, this);
        } catch (err) {
            throw Client._toDiscordError(err, {
                notFoundCode: RESTJSONErrorCodes.UnknownChannel,
                accessCode: RESTJSONErrorCodes.MissingAccess,
                message: "Channel not found"
            });
        }
    }

    async _fetchGuild(id, options = {}) {
        if (typeof id === "object") {
            return Client._wrapGuild(id, this);
        }

        id = Client._normalizeId(id);

        if (id == null) {
            return null;
        }

        const force = options?.force ?? false,
            cached = this.guilds.cache.get(id);

        if (!force && cached != null) {
            return cached;
        }

        try {
            const rawGuild = await this._raw.servers.fetch(id);
            return Client._wrapGuild(rawGuild, this);
        } catch (err) {
            throw Client._toDiscordError(err, {
                notFoundCode: RESTJSONErrorCodes.UnknownGuild,
                accessCode: RESTJSONErrorCodes.MissingAccess,
                message: "Guild not found"
            });
        }
    }

    async _fetchUser(id, options = {}) {
        id = Client._normalizeId(id);

        if (id == null) {
            return null;
        }

        const force = options?.force ?? false,
            cached = this.users.cache.get(id);

        if (!force && cached != null) {
            return cached;
        }

        const rawCached = this._raw.users?.get?.(id);

        if (!force && rawCached != null) {
            return Client._wrapUser(rawCached, this);
        }

        try {
            const rawUser = await this._raw.users.fetch(id);
            return Client._wrapUser(rawUser, this);
        } catch (err) {
            if (rawCached != null) {
                return Client._wrapUser(rawCached, this);
            }

            throw Client._toDiscordError(err, {
                notFoundCode: RESTJSONErrorCodes.UnknownUser,
                accessCode: RESTJSONErrorCodes.MissingAccess,
                message: "User not found"
            });
        }
    }
}

export { Client };
