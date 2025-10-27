import discord from "discord.js";

import EventLoader from "../loaders/event/EventLoader.js";

import Util from "../util/Util.js";
import TypeTester from "../util/TypeTester.js";
import ArrayUtil from "../util/ArrayUtil.js";
import ObjectUtil from "../util/ObjectUtil.js";
import DiscordUtil from "../util/DiscordUtil.js";
import diceSearch from "../util/search/diceSearch.js";

import ClientError from "../errors/ClientError.js";

const {
    Client,

    DiscordAPIError,
    RESTJSONErrorCodes,

    GatewayIntentBits,
    Partials,

    ActivityType,
    ChannelType,

    PermissionsBitField,

    Guild,
    GuildMember,
    BaseChannel,
    Message,
    User
} = discord;

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
            new ClientError("Can't create a new client before disposing the old one");
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
            if (!(key in options)) {
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
        const lowercaseTypes = DiscordClient._validActivityTypes.map(type => type.toLowerCase());

        let activityType = config.type.toLowerCase(),
            num = lowercaseTypes.indexOf(activityType);

        if (num === -1) {
            throw new ClientError(
                `Invalid activity type: ${activityType}. Valid types are: ${DiscordClient._validActivityTypes.join(" ")}`,
                activityType
            );
        }

        if (config.text == null) {
            throw new ClientError("Invalid activity text");
        }

        const presence = this.client.user.setActivity(config.text, {
                type: num
            }),
            activity = Util.first(presence.activities);

        const setType = ActivityType[activity.type],
            setText = activity.name;

        this.logger?.info(`Set activity status: "${setType} ${setText}"`);
        return activity;
    }

    async fetchGuild(sv_id, options = {}) {
        if (!TypeTester.isObject(options)) {
            throw new ClientError("Invalid options provided");
        }

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
            if (err.code === RESTJSONErrorCodes.UnknownGuild) {
                return null;
            }

            throw err;
        }

        return guild;
    }

    async fetchMember(sv_id, user_id, options = {}) {
        if (!TypeTester.isObject(options)) {
            throw new ClientError("Invalid options provided");
        }

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
            if (err.code === RESTJSONErrorCodes.UnknownMember) {
                return null;
            }

            throw err;
        }

        return member;
    }

    async fetchChannel(ch_id, options = {}) {
        if (!TypeTester.isObject(options)) {
            throw new ClientError("Invalid options provided");
        }

        ObjectUtil.setValuesWithDefaults(options, options, this.constructor.defaultChannelOptions);

        let channel;
        [ch_id, channel] = this._parseDiscordId(ch_id, "channel", BaseChannel);

        if (channel === null) {
            try {
                channel = await this.client.channels.fetch(ch_id, {
                    force: !options.cache
                });
            } catch (err) {
                if ([RESTJSONErrorCodes.UnknownChannel, RESTJSONErrorCodes.MissingAccess].includes(err.code)) {
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

                const threadChannel = [ChannelType.PublicThread, ChannelType.PrivateThread].includes(channel.type),
                    perms = (threadChannel ? channel.parent : channel).memberPermissions(member, true);

                if (perms === null || !perms.has(PermissionsBitField.Flags.ViewChannel)) {
                    return null;
                }
        }

        return channel;
    }

    async fetchMessage(ch_id, msg_id, options = {}) {
        if (!TypeTester.isObject(options)) {
            throw new ClientError("Invalid options provided");
        }

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
            if (err.code === RESTJSONErrorCodes.UnknownMessage) {
                return null;
            }

            throw err;
        }

        return message;
    }

    async fetchMessages(ch_id, options = {}, fetchOptions = {}) {
        if (!TypeTester.isObject(options) || !TypeTester.isObject(fetchOptions)) {
            throw new ClientError("Invalid options provided");
        }

        ObjectUtil.setValuesWithDefaults(options, options, this.constructor.defaultMessagesOptions);

        const channel = await this.fetchChannel(ch_id, options);

        if (channel === null) {
            return null;
        }

        ObjectUtil.setValuesWithDefaults(fetchOptions, fetchOptions, this.constructor.defaultMessagesFetchOptions);
        fetchOptions.force = !options.cache;

        {
            const parseAsMessage = msg_id => this._parseDiscordId(msg_id, "message", Message, false)[0] ?? undefined;

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

    async findUserById(user_id, options = {}) {
        if (!TypeTester.isObject(options)) {
            throw new ClientError("Invalid options provided");
        }

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
            if (err.code === RESTJSONErrorCodes.UnknownUser) {
                return null;
            }

            throw err;
        }

        return ((user.user = user), user);
    }

    async findUsers(query, options = {}, fetchOptions = {}) {
        if (query == null) {
            throw new ClientError("No query provided");
        } else if (!TypeTester.isObject(options) || !TypeTester.isObject(fetchOptions)) {
            throw new ClientError("Invalid options provided");
        }

        ObjectUtil.setValuesWithDefaults(options, options, this.constructor.defaultUsersOptions);

        let guilds = null;

        if (typeof options.sv_id === "string") {
            guilds = [await this.fetchGuild(options.sv_id)];
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

            if (typeof member !== "undefined") {
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

        ObjectUtil.setValuesWithDefaults(fetchOptions, fetchOptions, this.constructor.defaultUsersFetchOptions);

        const allMembers = (
            await Promise.all(
                guilds.map(guild =>
                    guild.members
                        .fetch({
                            query,
                            limit: fetchOptions.fetchLimit
                        })
                        .then(member => Array.from(member.values()))
                )
            )
        ).flat();

        const uniqueMembers = ArrayUtil.unique(allMembers, "id");

        return diceSearch(uniqueMembers, query, {
            maxResults: options.limit,
            minDist: options.searchMinDist,
            searchKey: "username"
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

    static {
        this._validActivityTypes = Object.entries(ActivityType)
            .filter(([key, value]) => !isNaN(key) && value !== "Custom")
            .map(([, value]) => value);
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
