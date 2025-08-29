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
    AllowedMentionsTypes,

    PermissionsBitField,

    User,
    GuildMember
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
        limit: 100
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
        limit: 100
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
        if (sv_id == null) {
            throw new ClientError("No guild ID provided");
        } else if (!TypeTester.isObject(options)) {
            throw new ClientError("Invalid options provided");
        }

        ObjectUtil.setValuesWithDefaults(options, options, this.constructor.defaultGuildOptions);

        let guild;

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
        if (sv_id == null) {
            throw new ClientError("No guild or guild ID provided");
        } else if (user_id == null) {
            throw new ClientError("No user or user ID provided");
        } else if (!TypeTester.isObject(options)) {
            throw new ClientError("Invalid options provided");
        }

        let guild;

        switch (typeof sv_id) {
            case "string":
                if (Util.empty(sv_id)) {
                    throw new ClientError("Invalid guild ID provided (length = 0)");
                }

                guild = await this.fetchGuild(sv_id);

                if (guild === null) {
                    return null;
                }

                break;
            case "object":
                guild = sv_id;
                break;
            default:
                throw new ClientError("Invalid guild or guild ID provided");
        }

        switch (typeof user_id) {
            case "string":
                if (Util.empty(user_id)) {
                    throw new ClientError("Invalid user ID provided (length = 0)");
                }

                break;
            case "object":
                const user = user_id;
                user_id = user.id;
                break;
            default:
                throw new ClientError("Invalid user or user ID provided");
        }

        ObjectUtil.setValuesWithDefaults(options, options, this.constructor.defaultMemberOptions);

        let member;

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
        if (ch_id == null) {
            throw new ClientError("No channel ID provided");
        } else if (!TypeTester.isObject(options)) {
            throw new ClientError("Invalid options provided");
        } else if (typeof ch_id === "string") {
            if (Util.empty(ch_id)) {
                throw new ClientError("Invalid channel ID provided (length = 0)");
            }
        } else {
            throw new ClientError("Invalid channel ID provided");
        }

        ObjectUtil.setValuesWithDefaults(options, options, this.constructor.defaultChannelOptions);

        let channel;

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

        if (!options.checkAccess) {
            return channel;
        }

        let user_id = options.user_id,
            user,
            member;

        if (user_id == null) {
            throw new ClientError("No user/member or user ID provided");
        }

        switch (typeof user_id) {
            case "string":
                if (Util.empty(user_id)) {
                    throw new ClientError("Invalid user ID provided (length = 0)");
                }

                break;
            case "object":
                if (user_id instanceof User) {
                    user = user_id;
                } else if (user_id instanceof GuildMember) {
                    member = user_id;

                    if (member.guild !== channel.guild) {
                        throw new ClientError("The member's guild isn't the same as the channel's guild", {
                            memberGuild: member.guild,
                            channelGuild: channel.guild
                        });
                    }
                }

                user_id = user?.id ?? member?.id;
                break;
            default:
                throw new ClientError("Invalid user/member or user ID provided");
        }

        if (channel.type === ChannelType.DM) {
            if (channel.recipientId !== user_id) {
                return null;
            }
        } else {
            if (typeof member === "undefined") {
                member = await this.fetchMember(channel.guild, user_id);

                if (member === null) {
                    return null;
                }
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
        if (ch_id == null) {
            throw new ClientError("No channel or channel ID provided");
        } else if (msg_id == null) {
            throw new ClientError("No message ID provided");
        } else if (!TypeTester.isObject(options)) {
            throw new ClientError("Invalid options provided");
        } else if (typeof msg_id === "string") {
            if (Util.empty(msg_id)) {
                throw new ClientError("Invalid message ID provided (length = 0)");
            }
        } else {
            throw new ClientError("Invalid message ID provided");
        }

        let channel;

        switch (typeof ch_id) {
            case "string":
                const channelOptions = {
                    checkAccess: options.checkAccess,
                    user_id: options.user_id
                };

                channel = await this.fetchChannel(ch_id, channelOptions);

                if (channel === null) {
                    return null;
                }

                break;
            case "object":
                channel = ch_id;
                break;
            default:
                throw new ClientError("Invalid channel or channel ID provided");
        }

        ObjectUtil.setValuesWithDefaults(options, options, this.constructor.defaultMessageOptions);

        try {
            return await channel.messages.fetch(msg_id, {
                force: !options.cache
            });
        } catch (err) {
            if (err.code === RESTJSONErrorCodes.UnknownMessage) {
                return null;
            }

            throw err;
        }
    }

    async fetchMessages(ch_id, options = {}, fetchOptions = {}) {
        if (ch_id == null) {
            throw new ClientError("No channel or channel ID provided");
        } else if (!TypeTester.isObject(options) || !TypeTester.isObject(fetchOptions)) {
            throw new ClientError("Invalid options provided");
        }

        ObjectUtil.setValuesWithDefaults(options, options, this.constructor.defaultMessagesOptions);

        let channel;

        switch (typeof ch_id) {
            case "string":
                const channelOptions = {
                    checkAccess: options.checkAccess,
                    user_id: options.user_id
                };

                channel = await this.fetchChannel(ch_id, channelOptions);

                if (channel === null) {
                    return null;
                }

                break;
            case "object":
                channel = ch_id;
                break;
            default:
                throw new ClientError("Invalid channel or channel ID");
        }

        ObjectUtil.setValuesWithDefaults(fetchOptions, fetchOptions, this.constructor.defaultMessagesFetchOptions);
        fetchOptions.force = !options.cache;

        let messages;

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
        if (user_id == null) {
            throw new ClientError("No user ID provided");
        } else if (!TypeTester.isObject(options)) {
            throw new ClientError("Invalid options provided");
        }

        ObjectUtil.setValuesWithDefaults(options, options, this.constructor.defaultUserOptions);

        let user;

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

        user.user = user;
        return user;
    }

    async findUsers(query, options = {}, fetchOptions = {}) {
        if (query == null) {
            throw new ClientError("No query provided");
        } else if (!TypeTester.isObject(options) || !TypeTester.isObject(fetchOptions)) {
            throw new ClientError("Invalid options provided");
        }

        ObjectUtil.setValuesWithDefaults(options, options, this.constructor.defaultUsersOptions);

        let guilds;

        if (typeof options.sv_id === "string") {
            guilds = [await this.fetchGuild(options.sv_id)];
        } else {
            guilds = Array.from(this.client.guilds.cache.values());
        }

        const foundId = Util.first(DiscordUtil.findUserIds(query)),
            foundMention = Util.first(DiscordUtil.findMentions(query)),
            user_id = foundId ?? foundMention;

        if (typeof user_id !== "undefined") {
            let member;

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
        if (typeof this._eventLoader === "undefined" || !this._eventLoader.loaded) {
            throw new ClientError("Can't unload events, events were never loaded");
        }

        this._eventLoader.removeListeners();
        delete this._eventLoader;
    }
}

export default DiscordClient;
