import discord from "discord.js";

import EventLoader from "../loaders/event/EventLoader.js";

import Util from "../util/Util.js";
import TypeTester from "../util/TypeTester.js";
import ArrayUtil from "../util/ArrayUtil.js";
import ObjectUtil from "../util/ObjectUtil.js";
import DiscordUtil from "../util/DiscordUtil.js";
import { isErrorCode } from "../util/discord/ErrorCodes.js";
import diceSearch from "../util/search/diceSearch.js";

import ClientError from "../errors/ClientError.js";

const {
    Client,

    DiscordAPIError,

    GatewayIntentBits,
    Partials,

    ActivityType,
    ChannelType,

    PermissionsBitField,

    Guild,
    GuildMember,
    BaseChannel,
    TextChannel,
    Message,
    User,
    Role
} = discord;

function normalizeAttachments(attachments) {
    attachments = ArrayUtil.guaranteeArray(attachments).filter(item => item != null);

    return attachments.map((attach, i) =>
        TypeTester.isObject(attach)
            ? {
                  id: String(attach.id ?? i),
                  filename: attach.filename ?? attach.name ?? `file-${i}`,
                  content_type: attach.content_type ?? attach.contentType,
                  proxy_url: attach.proxy_url ?? attach.proxyURL ?? attach.url,
                  ...attach
              }
            : {
                  id: String(i),
                  filename: `file-${i}`,
                  url: String(attach)
              }
    );
}

function normalizeEmbeds(embeds) {
    return ArrayUtil.guaranteeArray(embeds)
        .filter(item => item != null)
        .map(embed => DiscordUtil.getBuiltEmbed(embed));
}

class DiscordClient {
    static defaultIntents = [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.DirectMessages
    ];

    static defaultPartials = [Partials.Channel];

    static defaultDiscordOptions = {
        failIfNotExists: false
    };

    static clientOptions = ["wrapEvents", "eventsDir", "loginTimeout", "mentionUsers", "pingReply"];

    static defaultGuildOptions = {
        cache: true
    };

    static defaultMemberOptions = {
        cache: true
    };

    static defaultChannelOptions = {
        cache: true,
        checkAccess: false
    };

    static defaultMessageOptions = {
        cache: true,
        checkAccess: false
    };

    static defaultMessagesOptions = {
        checkAccess: false
    };

    static defaultMessagesFetchOptions = {
        limit: 50
    };

    static defaultUserOptions = {
        cache: true
    };

    static defaultUsersOptions = {
        onlyMembers: false,
        searchMembers: true,
        searchMinDist: 0,
        limit: 10
    };

    static defaultUsersFetchOptions = {
        limit: 50
    };

    static emulatableUserFields = Object.freeze([
        Object.freeze({
            name: "id",
            type: "string"
        }),
        Object.freeze({
            name: "username",
            type: "string"
        }),
        Object.freeze({
            name: "globalName",
            type: "string"
        }),
        Object.freeze({
            name: "bot",
            type: "boolean"
        })
    ]);

    static emulatableGuildFields = Object.freeze([
        Object.freeze({
            name: "id",
            type: "string"
        }),
        Object.freeze({
            name: "name",
            type: "string"
        })
    ]);

    static emulatableChannelFields = Object.freeze([
        Object.freeze({
            name: "id",
            type: "string"
        }),
        Object.freeze({
            name: "type",
            type: "number"
        }),
        Object.freeze({
            name: "name",
            type: "string"
        }),
        Object.freeze({
            name: "lastMessageId",
            type: "string"
        })
    ]);

    static emulatableMemberFields = Object.freeze([
        Object.freeze({
            name: "id",
            type: "string"
        }),
        Object.freeze({
            name: "nick",
            type: "string"
        }),
        Object.freeze({
            name: "roles",
            type: "array"
        })
    ]);

    static emulatableMessageDataFields = Object.freeze([
        Object.freeze({
            name: "id",
            type: "string"
        }),
        Object.freeze({
            name: "type",
            type: "number"
        }),
        Object.freeze({
            name: "reactions",
            type: "array"
        }),
        Object.freeze({
            name: "attachments",
            type: "array"
        }),
        Object.freeze({
            name: "embeds",
            type: "array"
        }),
        Object.freeze({
            name: "mentions",
            type: "any"
        })
    ]);

    static emulatableMessageFields = Object.freeze([
        Object.freeze({
            name: "message",
            type: "object",
            cliPrefix: "msg",
            fields: this.emulatableMessageDataFields
        }),
        Object.freeze({
            name: "author",
            type: "object",
            cliPrefix: "author",
            fields: this.emulatableUserFields
        }),
        Object.freeze({
            name: "guild",
            type: "object",
            cliPrefix: "guild",
            fields: this.emulatableGuildFields
        }),
        Object.freeze({
            name: "channel",
            type: "object",
            cliPrefix: "channel",
            fields: this.emulatableChannelFields
        }),
        Object.freeze({
            name: "member",
            type: "object",
            fields: this.emulatableMemberFields
        })
    ]);

    constructor(intents, partials) {
        this.intents = intents ?? DiscordClient.defaultIntents;
        this.partials = partials ?? DiscordClient.defaultPartials;

        this.timeout = 60 / Util.durationSeconds.milli;
        this.mentionUsers = false;
        this.pingReply = true;

        this.client = null;
        this.buildClient();

        this.wrapEvents = false;
        this.eventsDir = "";
    }

    buildClient() {
        if (this.client !== null) {
            throw new ClientError("Can't create a new client before disposing the old one");
        }

        this.logger?.info("Creating client...");

        const options = {
            intents: this.intents,
            partials: this.partials,

            rest: {},
            ...this.constructor.defaultDiscordOptions
        };

        options.rest.timeout = this.timeout + 1;

        const client = new Client(options);

        this.client = client;
        this.loggedIn = false;

        this.setOptions();
    }

    setOptions(options) {
        this.options = {};
        const optionsList = TypeTester.isObject(options) ? this.constructor.clientOptions : [];

        for (const key of optionsList) {
            if (!Object.hasOwn(options, key)) {
                continue;
            }

            const option = typeof options[key] === "function" ? options[key].bind(this) : options[key];

            this.options[key] = option;
            this[key] = option;
        }

        this.client.options.allowedMentions = {
            repliedUser: this.pingReply,
            parse: this.mentionUsers ? ["users", "roles"] : []
        };
    }

    async login(token, exitOnFailure = false) {
        this.logger?.info("Logging in...");

        try {
            await this.client.login(token);
            await Util.waitForCondition(() => this.loggedIn, new ClientError("Login took too long"), this.timeout);

            return true;
        } catch (err) {
            this.logger?.error("Error occurred while logging in:", err);

            if (exitOnFailure) {
                this.killProcess();
                return false;
            } else {
                throw err;
            }
        }
    }

    logout(kill = false) {
        if (typeof this.onLogout === "function") {
            this.onLogout();
        }

        this.client.destroy();
        this.client = null;

        this.loggedIn = false;
        this.logger?.info("Destroyed client.");

        if (kill) {
            this.killProcess();
        }
    }

    setActivity(config) {
        if (!TypeTester.isObject(config)) {
            throw new ClientError("Invalid activity config");
        }

        let activityType = String(config.type ?? "")
                .trim()
                .toLowerCase(),
            activityText = String(config.text ?? "").trim();

        activityType = TypeTester.normalizeEnum(
            activityType,
            DiscordClient._validActivityTypeNames,
            "activity type",
            ClientError,
            {
                message: value =>
                    `Invalid activity type: ${value}. Valid types are: ${this.constructor._validActivityTypes.join(" ")}`
            }
        );

        if (Util.empty(activityText)) {
            throw new ClientError("Invalid activity text");
        }

        const presence = this.client.user.setActivity(activityText, {
                type: DiscordClient._validActivityTypeNames.indexOf(activityType)
            }),
            activity = Util.first(presence.activities);

        const setType = ActivityType[activity.type],
            setText = activity.name;

        this.logger?.info(`Set activity status: "${setType} ${setText}"`);
        return activity;
    }

    async fetchGuild(sv_id, options) {
        options = ObjectUtil.guaranteeObject(options);
        ObjectUtil.setValuesWithDefaults(options, options, this.constructor.defaultGuildOptions);

        let guild;
        [sv_id, guild] = this._parseDiscordId(sv_id, "guild", Guild);

        if (guild !== null) {
            return guild;
        }

        try {
            guild = await this.client.guilds.fetch(sv_id, {
                force: !options.cache
            });
        } catch (err) {
            if (isErrorCode("unknownGuild", err)) {
                return null;
            }

            throw err;
        }

        return guild;
    }

    async fetchMember(sv_id, user_id, options) {
        options = ObjectUtil.guaranteeObject(options);
        ObjectUtil.setValuesWithDefaults(options, options, this.constructor.defaultMemberOptions);

        const guild = await this.fetchGuild(sv_id, options);

        if (guild === null) {
            return null;
        }

        let member;
        [user_id, member] = this._parseDiscordId(user_id, "member", GuildMember);

        if (member !== null) {
            return member;
        }

        try {
            member = await guild.members.fetch(user_id, {
                force: !options.cache
            });
        } catch (err) {
            if (isErrorCode("unknownMember", err)) {
                return null;
            }

            throw err;
        }

        return member;
    }

    async fetchChannel(ch_id, options) {
        options = ObjectUtil.guaranteeObject(options);
        ObjectUtil.setValuesWithDefaults(options, options, this.constructor.defaultChannelOptions);

        let channel;
        [ch_id, channel] = this._parseDiscordId(ch_id, "channel", BaseChannel);

        if (channel === null) {
            try {
                channel = await this.client.channels.fetch(ch_id, {
                    force: !options.cache
                });
            } catch (err) {
                if (isErrorCode("channelInaccessible", err)) {
                    return null;
                }

                throw err;
            }
        }

        if (!options.checkAccess) {
            return channel;
        }

        const user_id = options.user_id;

        switch (channel.type) {
            case ChannelType.DM:
                if (user_id == null) {
                    throw new ClientError("No user ID provided");
                } else if (typeof user_id === "string") {
                    if (Util.empty(user_id)) {
                        throw new ClientError("No user ID provided (length = 0)");
                    } else if (channel.recipientId !== user_id) {
                        return null;
                    }
                } else {
                    throw new ClientError("Invalid user ID provided");
                }

                break;
            default:
                const member = await this.fetchMember(channel.guild, user_id);

                if (member === null) {
                    return null;
                }

                if (member.guild !== channel.guild) {
                    throw new ClientError("The member's guild isn't the same as the channel's guild", {
                        memberGuild: member.guild,
                        channelGuild: channel.guild
                    });
                }

                const threadChannel = DiscordUtil.isThreadChannel(channel),
                    perms = (threadChannel ? channel.parent : channel).memberPermissions(member, true);

                if (perms === null || !perms.has(PermissionsBitField.Flags.ViewChannel)) {
                    return null;
                }
        }

        return channel;
    }

    async fetchMessage(ch_id, msg_id, options) {
        options = ObjectUtil.guaranteeObject(options);
        ObjectUtil.setValuesWithDefaults(options, options, this.constructor.defaultMessageOptions);

        const channel = await this.fetchChannel(ch_id, options);

        if (channel === null) {
            return null;
        }

        let message;
        [msg_id, message] = this._parseDiscordId(msg_id, "message", Message);

        if (message !== null) {
            return message;
        }

        try {
            message = await channel.messages.fetch(msg_id, {
                force: !options.cache
            });
        } catch (err) {
            if (isErrorCode("unknownMessage", err)) {
                return null;
            }

            throw err;
        }

        return message;
    }

    async emulateUser(user_id, override) {
        override = ObjectUtil.guaranteeObject(override);
        user_id = override.id ?? user_id ?? "0";

        if (Util.empty(Object.keys(override)) && user_id !== "0") {
            try {
                const user = await this.findUserById(user_id);

                if (user !== null) {
                    return user;
                }
            } catch (err) {}
        }

        return new User(this.client, {
            id: user_id,
            username: override.username ?? "dummy-user",
            global_name: override.globalName ?? null,
            discriminator: "0",
            bot: override.bot ?? false
        });
    }

    async emulateGuild(sv_id, override) {
        override = ObjectUtil.guaranteeObject(override);
        sv_id = override.id ?? sv_id ?? "0";

        if (Util.empty(Object.keys(override)) && sv_id !== "0") {
            try {
                const guild = await this.fetchGuild(sv_id);

                if (guild !== null) {
                    return guild;
                }
            } catch (err) {}
        }

        const guild = new Guild(this.client, {
            id: sv_id,
            name: override.name ?? "dummy-guild"
        });

        const everyoneRole = new Role(
            this.client,
            {
                id: sv_id,
                name: "@everyone",
                color: 0,
                hoist: false,
                position: 0,
                permissions: 0n,
                managed: false,
                mentionable: false,
                colors: {
                    primary_color: 0,
                    secondary_color: null,
                    tertiary_color: null
                }
            },
            guild
        );

        guild.roles.cache.set(sv_id, everyoneRole);

        return guild;
    }

    async emulateMember(user_id, sv_id, guild, override) {
        override = ObjectUtil.guaranteeObject(override);
        user_id = override.id ?? user_id ?? "0";

        if (Util.empty(Object.keys(override)) && user_id !== "0" && sv_id !== "0") {
            try {
                const member = await this.fetchMember(sv_id, user_id);

                if (member !== null) {
                    return member;
                }
            } catch (err) {}
        }

        const userOverride = ObjectUtil.guaranteeObject(override.user),
            memberOverride = override;

        const user = await this.emulateUser(user_id, userOverride);

        for (const roleId of memberOverride.roles ?? []) {
            if (guild.roles.cache.has(roleId)) {
                continue;
            }

            guild.roles.cache.set(
                roleId,
                new Role(
                    this.client,
                    {
                        id: roleId,
                        name: roleId,
                        color: 0,
                        hoist: false,
                        position: 0,
                        permissions: 0n,
                        managed: false,
                        mentionable: false,
                        colors: {
                            primary_color: 0,
                            secondary_color: null,
                            tertiary_color: null
                        }
                    },
                    guild
                )
            );
        }

        const member = new GuildMember(
            this.client,
            {
                nick: memberOverride.nick ?? null,
                roles: memberOverride.roles ?? []
            },
            guild
        );

        member.user = user;
        member.nick = memberOverride.nick ?? null;
        member.nickname = memberOverride.nick ?? null;

        if (!this.client.guilds.cache.has(guild.id)) {
            guild.members.cache.set(user_id, member);
        }

        return member;
    }

    async emulateChannel(ch_id, guild, override) {
        override = ObjectUtil.guaranteeObject(override);
        ch_id = override.id ?? ch_id ?? "0";

        if (Util.empty(Object.keys(override)) && ch_id !== "0") {
            try {
                const channel = await this.fetchChannel(ch_id);

                if (channel !== null) {
                    return channel;
                }
            } catch (err) {}
        }

        const channel = new TextChannel(
            guild,
            {
                id: ch_id,
                type: override.type ?? ChannelType.GuildText,
                name: override.name ?? "dummy-channel",
                guild_id: guild.id,
                last_message_id: override.lastMessageId ?? null
            },
            this.client
        );

        if (!this.client.guilds.cache.has(guild.id)) {
            guild.channels.cache.set(ch_id, channel);
        }

        return channel;
    }

    async emulateMessage(content, override) {
        override = ObjectUtil.guaranteeObject(override);

        const messageOverride = ObjectUtil.guaranteeObject(override.message),
            guildOverride = ObjectUtil.guaranteeObject(override.guild),
            channelOverride = ObjectUtil.guaranteeObject(override.channel),
            authorOverride = ObjectUtil.guaranteeObject(override.author),
            memberOverride = ObjectUtil.guaranteeObject(override.member),
            user_id = authorOverride.id ?? this.owner ?? "0",
            sv_id = guildOverride.id ?? "0",
            ch_id = channelOverride.id ?? "0";

        const guild = await this.emulateGuild(sv_id, guildOverride),
            channel = await this.emulateChannel(ch_id, guild, channelOverride),
            member = await this.emulateMember(user_id, guild.id, guild, {
                ...memberOverride,
                user: authorOverride
            });

        content = content ?? "";

        const embeds = normalizeEmbeds(messageOverride.embeds),
            attachments = normalizeAttachments(messageOverride.attachments),
            msg_id = messageOverride.id ?? DiscordUtil.snowflakeFromDate(new Date()),
            type = messageOverride.type ?? 0,
            reactions = messageOverride.reactions ?? [],
            mentionOverrides = ObjectUtil.guaranteeObject(messageOverride.mentions),
            mentionUsers = ArrayUtil.guaranteeArray(mentionOverrides.users, undefined, true),
            mentionRoles = ArrayUtil.guaranteeArray(mentionOverrides.roles, undefined, true),
            mentionChannels = ArrayUtil.guaranteeArray(mentionOverrides.channels, undefined, true),
            mentionEveryone = mentionOverrides.everyone ?? false,
            referencedMessage =
                mentionOverrides.repliedUser == null
                    ? null
                    : {
                          author: mentionOverrides.repliedUser
                      };

        const message = new Message(this.client, {
            id: msg_id,
            channel_id: channel.id,
            guild_id: guild.id,
            content,
            author: member.user,
            type,
            embeds,
            components: [],
            attachments,
            reactions,
            mentions: mentionUsers,
            mention_roles: mentionRoles,
            mention_everyone: mentionEveryone,
            mention_channels: mentionChannels,
            ...(referencedMessage === null
                ? {}
                : {
                      referenced_message: referencedMessage
                  })
        });

        message.author = member.user;
        message.reactions = reactions;

        Object.defineProperty(message, "channel", {
            get() {
                return channel;
            },
            configurable: true
        });

        Object.defineProperty(message, "guild", {
            get() {
                return guild;
            },
            configurable: true
        });

        Object.defineProperty(message, "member", {
            get() {
                return member;
            },
            configurable: true
        });

        return message;
    }

    async fetchMessages(ch_id, options, fetchOptions) {
        options = ObjectUtil.guaranteeObject(options);
        ObjectUtil.setValuesWithDefaults(options, options, this.constructor.defaultMessagesOptions);

        const channel = await this.fetchChannel(ch_id, options);

        if (channel === null) {
            return null;
        }

        fetchOptions = ObjectUtil.guaranteeObject(fetchOptions);
        ObjectUtil.setValuesWithDefaults(fetchOptions, fetchOptions, this.constructor.defaultMessagesFetchOptions);
        fetchOptions.force = !options.cache;

        {
            const parseAsMessage = msg_id =>
                Util.first(this._parseDiscordId(msg_id, "message", Message, false)) ?? undefined;

            fetchOptions.before = parseAsMessage(fetchOptions.before);
            fetchOptions.after = parseAsMessage(fetchOptions.after);
            fetchOptions.around = parseAsMessage(fetchOptions.around);
        }

        let messages = null;

        try {
            messages = await channel.messages.fetch(fetchOptions);
        } catch (err) {
            if (err instanceof DiscordAPIError) {
                return null;
            }

            throw err;
        }

        return messages;
    }

    async findUserById(user_id, options) {
        options = ObjectUtil.guaranteeObject(options);
        ObjectUtil.setValuesWithDefaults(options, options, this.constructor.defaultUserOptions);

        let user;
        [user_id, user] = this._parseDiscordId(user_id, "user", User);

        if (user !== null) {
            return ((user.user = user), user);
        }

        try {
            user = await this.client.users.fetch(user_id, {
                force: !options.cache
            });
        } catch (err) {
            if (isErrorCode("unknownUser", err)) {
                return null;
            }

            throw err;
        }

        return ((user.user = user), user);
    }

    async formatUser(user, discord = false, options) {
        if (Util.empty(user) || user === "0") {
            return "invalid";
        }

        if (TypeTester.isObject(user) && Util.nonemptyString(user.username)) {
            return DiscordUtil.formatUser(user, null, discord, options);
        }

        const userId = typeof user === "string" ? user : user?.id;
        let fetched = null;

        try {
            fetched = await this.findUserById(userId);
        } catch (err) {}

        const username = fetched?.username ?? null;
        return DiscordUtil.formatUser(username, userId, discord, options);
    }

    async findUsers(query, options, fetchOptions) {
        query = String(query ?? "").trim();

        if (Util.empty(query)) {
            throw new ClientError("No query provided");
        }

        options = ObjectUtil.guaranteeObject(options);
        ObjectUtil.setValuesWithDefaults(options, options, this.constructor.defaultUsersOptions);

        let guilds = null;

        if (typeof options.sv_id === "string") {
            guilds = [await this.fetchGuild(options.sv_id)].filter(Boolean);
        } else {
            guilds = Array.from(this.client.guilds.cache.values());
        }

        const foundId = Util.first(DiscordUtil.findUserIds(query)),
            foundMention = Util.first(DiscordUtil.findMentions(query)),
            user_id = foundId ?? foundMention;

        if (typeof user_id !== "undefined") {
            let member = null;

            if (options.searchMembers) {
                const members = await Promise.all(guilds.map(guild => this.fetchMember(guild, user_id)));
                member = members.find(Boolean);
            }

            if (member != null) {
                return [member];
            } else if (options.onlyMembers) {
                return [];
            }

            const user = await this.findUserById(user_id);
            return user ? ((user.user = user), [user]) : [];
        }

        if (!options.searchMembers) {
            return [];
        }

        fetchOptions = ObjectUtil.guaranteeObject(fetchOptions);
        ObjectUtil.setValuesWithDefaults(fetchOptions, fetchOptions, this.constructor.defaultUsersFetchOptions);

        const allMembers = (
            await Promise.all(
                guilds.map(guild =>
                    guild.members
                        .fetch({
                            query,
                            limit: fetchOptions.limit
                        })
                        .then(member => Array.from(member.values()))
                )
            )
        ).flat();

        const uniqueMembers = ArrayUtil.unique(allMembers, "id");

        return diceSearch(uniqueMembers, query, {
            maxResults: options.limit,
            minDist: options.searchMinDist,
            searchKey: "displayName"
        }).results;
    }

    killProcess() {
        if (typeof this.onKill === "function") {
            this.onKill();
        }

        process.exit(0);
    }

    onReady() {
        this.loggedIn = true;

        this.botId = this.client.user.id;
        this.botUsername = this.client.user.username;

        this.logger?.info(`The bot is online. Logged in as "${this.botUsername}".`);
    }

    static _validActivityTypes;
    static _validActivityTypeNames;

    static {
        this._validActivityTypes = Object.entries(ActivityType)
            .filter(([key, value]) => !isNaN(key) && value !== "Custom")
            .map(([, value]) => value);

        this._validActivityTypeNames = this._validActivityTypes.map(type => type.toLowerCase());
    }

    async _loadEvents() {
        if (Util.empty(this.eventsDir)) {
            throw new ClientError("Events directory not set");
        }

        const eventLoader = new EventLoader(this.eventsDir, this.client, this.logger, {
            client: this.client,
            wrapFunc: this._wrapEvent,
            wrapEvents: this.wrapEvents
        });

        await eventLoader.load();
        this._eventLoader = eventLoader;
    }

    _unloadEvents() {
        if (!this._eventLoader?.loaded) {
            throw new ClientError("Can't unload events, events were never loaded");
        }

        this._eventLoader.removeListeners();
        delete this._eventLoader;
    }

    _parseDiscordId(id, name, _class, strictExists) {
        if (id instanceof _class) {
            const obj = id;
            return [obj.id, id];
        } else if (TypeTester.isObject(id)) {
            ({ id } = id);
        }

        if (id == null) {
            return strictExists
                ? (() => {
                      throw new ClientError(`No ${name} ID provided`, name);
                  })()
                : [null, null];
        } else if (typeof id === "string") {
            if (Util.empty(id)) {
                throw new ClientError(`No ${name} ID provided (length = 0)`, name);
            }

            return [id, null];
        } else {
            throw new ClientError(`Invalid ${name} ID provided`, name);
        }
    }
}

export default DiscordClient;
