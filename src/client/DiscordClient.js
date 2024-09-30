import discord from "discord.js";

import ClientError from "../errors/ClientError.js";
import EventLoader from "../loaders/event/EventLoader.js";

import Util from "../util/Util.js";
import search from "../util/search/diceSearch.js";

const {
    Client,
    DiscordAPIError,
    RESTJSONErrorCodes,
    GatewayIntentBits,
    Partials,
    ActivityType,
    PermissionsBitField,
    ChannelType,
    User,
    GuildMember
} = discord;

const clientOptions = ["wrapEvents", "eventsDir", "loginTimeout", "mentionUsers", "pingReply"];

const defaultIntents = [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.DirectMessages
    ],
    defaultPartials = [Partials.Channel];

const userIdRegex = /(\d{17,20})/,
    mentionRegex = /<@(\d{17,20})>/;

const defaultGuildOptions = {
    cache: true
};

const defaultMemberOptions = {
    cache: true
};

const defaultChannelOptions = {
    cache: true,
    checkAccess: true
};

const defaultMessageOptions = {
    cache: true,
    checkAccess: true
};

const defaultMessagesOptions = {
        checkAccess: true
    },
    defaultMessagesFetchOptions = {
        limit: 100
    };

const defaultUserOptions = {
    cache: true
};

const defaultUsersOptions = {
        onlyMembers: false,
        searchMembers: true,
        searchMinDist: 0,
        limit: 10
    },
    defaultUsersFetchOptions = {
        limit: 100
    };

class DiscordClient {
    constructor(intents, partials) {
        this.intents = intents ?? defaultIntents;
        this.partials = partials ?? defaultPartials;

        this.timeout = 60 / Util.durationSeconds.milli;
        this.mentionUsers = false;
        this.pingReply = true;

        this.buildClient();

        this.wrapEvents = false;
        this.eventsDir = "";
    }

    buildClient() {
        if (typeof this.client !== "undefined") {
            new ClientError("Can't create a new client without disposing the old one");
        }

        this.logger?.info("Creating client...");

        const options = {
            intents: this.intents,
            partials: this.partials,
            rest: {
                timeout: this.timeout + 1
            }
        };

        const client = new Client(options);

        this.client = client;
        this.loggedIn = false;

        this.setOptions();
    }

    setOptions(options) {
        this.options = {};

        const optionsList = typeof options !== "undefined" ? clientOptions : [];

        for (const key of optionsList) {
            if (typeof options[key] === "undefined") {
                continue;
            }

            let option = options[key];

            if (typeof options[key] === "function") {
                option = option.bind(this);
            }

            this.options[key] = option;
            this[key] = option;
        }

        const allowedMentions = {
            repliedUser: this.pingReply
        };

        if (this.mentionUsers) {
            allowedMentions.parse = ["roles", "users"];
        } else {
            allowedMentions.users = [];
        }

        this.client.options = {
            ...this.client.options,
            allowedMentions
        };
    }

    async login(token, exitOnFailure = false) {
        this.logger?.info("Logging in...");

        const loginPromise = new Promise((resolve, reject) => {
            this.client.login(token).catch(err => {
                if (!exitOnFailure) {
                    reject(err);
                }

                this.logger?.error("Error occured while logging in:", err);
                resolve(false);
            });

            Util.waitForCondition(_ => this.loggedIn, new ClientError("Login took too long"), this.timeout)
                .then(_ => {
                    if (exitOnFailure) {
                        resolve(true);
                    }

                    resolve();
                })
                .catch(err => {
                    if (!exitOnFailure) {
                        reject(err);
                    }

                    this.logger?.error(err);
                    resolve(false);
                });
        });

        const res = await loginPromise;

        if (exitOnFailure && !res) {
            this.killProcess();
        }
    }

    onReady() {
        this.loggedIn = true;
        this.logger?.info(`The bot is online. Logged in as "${this.client.user.username}".`);
    }

    logout(kill = false) {
        if (typeof this.onLogout === "function") {
            this.onLogout();
        }

        this.client.destroy();
        delete this.client;

        this.loggedIn = false;
        this.logger?.info("Destroyed client.");

        if (kill) {
            this.killProcess();
        }
    }

    async loadEvents() {
        if (this.eventsDir === "") {
            throw new ClientError("Events directory not set");
        }

        const eventLoader = new EventLoader(this.eventsDir, this.client, this.logger, {
            client: this.client,
            wrapFunc: this.wrapEvent,
            wrapEvents: this.wrapEvents
        });

        await eventLoader.load();
        this.eventLoader = eventLoader;
    }

    unloadEvents() {
        if (typeof this.eventLoader === "undefined" || !this.eventLoader.loaded) {
            throw new ClientError("Can't unload events, events weren't loaded");
        }

        this.eventLoader.removeListeners();
        delete this.eventLoader;
    }

    setActivity(config) {
        const validTypes = Object.entries(ActivityType)
                .filter(([key, value]) => !isNaN(key) && value !== "Custom")
                .map(([_, value]) => value),
            lowercaseTypes = validTypes.map(x => x.toLowerCase());

        let activityType = config.type.toLowerCase(),
            num = lowercaseTypes.indexOf(activityType);

        if (num === -1) {
            throw new ClientError(`Invalid activity type: ${activityType}. Valid types are: ${validTypes.join(" ")}`);
        }

        if (typeof config.text === "undefined") {
            throw new ClientError("Invalid activity text");
        }

        const presence = this.client.user.setActivity(config.text, {
                type: num
            }),
            activity = Util.firstElement(presence.activities);

        const setType = ActivityType[activity.type],
            setText = activity.name;

        this.logger?.info(`Set activity status: "${setType} ${setText}"`);
        return activity;
    }

    async fetchGuild(sv_id, options = {}) {
        if (sv_id === null || typeof sv_id === "undefined") {
            throw new ClientError("No guild ID provided");
        }

        Util.setValuesWithDefaults(options, options, defaultGuildOptions);

        let guild;

        try {
            guild = await this.client.guilds.fetch(sv_id, {
                force: !options.cache
            });
        } catch (err) {
            if (err.code === RESTJSONErrorCodes.UnknownGuild) {
                return false;
            }

            throw err;
        }

        return guild;
    }

    async fetchMember(sv_id, user_id, options = {}) {
        if (sv_id === null || typeof sv_id === "undefined") {
            throw new ClientError("No guild or guild ID provided");
        }

        if (user_id === null || typeof user_id === "undefined") {
            throw new ClientError("No user or user ID provided");
        }

        let guild;

        switch (typeof sv_id) {
            case "string":
                if (sv_id.length < 1) {
                    throw new ClientError("Invalid guild ID provided (length = 0)");
                }

                guild = await this.fetchGuild(sv_id);

                if (!guild) {
                    return false;
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
                if (user_id.length < 1) {
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

        Util.setValuesWithDefaults(options, options, defaultMemberOptions);

        let member;

        try {
            member = await guild.members.fetch(user_id, {
                force: !options.cache
            });
        } catch (err) {
            if (err.code === RESTJSONErrorCodes.UnknownMember) {
                return false;
            }

            throw err;
        }

        return member;
    }

    async fetchChannel(ch_id, options = {}) {
        if (ch_id === null || typeof ch_id === "undefined") {
            throw new ClientError("No channel ID provided");
        }

        switch (typeof ch_id) {
            case "string":
                if (ch_id.length < 1) {
                    throw new ClientError("Invalid channel ID provided (length = 0)");
                }

                break;
            default:
                throw new ClientError("Invalid channel ID provided");
        }

        Util.setValuesWithDefaults(options, options, defaultChannelOptions);

        let channel;

        try {
            channel = await this.client.channels.fetch(ch_id, {
                force: !options.cache
            });
        } catch (err) {
            if ([RESTJSONErrorCodes.UnknownChannel, RESTJSONErrorCodes.MissingAccess].includes(err.code)) {
                return false;
            }

            throw err;
        }

        if (!options.checkAccess) {
            return channel;
        }

        let user_id = options.user_id,
            user,
            member;

        if (user_id === null || typeof user_id === "undefined") {
            throw new ClientError("No user/member or user ID provided");
        }

        switch (typeof user_id) {
            case "string":
                if (user_id.length < 1) {
                    throw new ClientError("Invalid user ID provided (length = 0)");
                }

                break;
            case "object":
                if (user_id instanceof User) {
                    user = user_id;
                } else if (user_id instanceof GuildMember) {
                    member = user_id;

                    if (member.guild !== channel.guild) {
                        throw new ClientError("The member's guild isn't the same as the channel's guild");
                    }
                }

                user_id = user?.id ?? member?.id;
                break;
            default:
                throw new ClientError("Invalid user/member or user ID provided");
        }

        switch (channel.type) {
            case ChannelType.DM:
                if (channel.recipientId !== user_id) {
                    return false;
                }

                break;
            default:
                if (typeof member === "undefined") {
                    member = await this.fetchMember(channel.guild, user_id);

                    if (!member) {
                        return false;
                    }
                }

                const perms = channel.memberPermissions(member, true);

                if (perms === null || !perms.has(PermissionsBitField.Flags.ViewChannel)) {
                    return false;
                }

                break;
        }

        return channel;
    }

    async fetchMessage(ch_id, msg_id, options = {}) {
        if (msg_id === null || typeof msg_id === "undefined") {
            throw new ClientError("No message ID provided");
        }

        if (ch_id === null || typeof ch_id === "undefined") {
            throw new ClientError("No channel or channel ID provided");
        }

        switch (typeof msg_id) {
            case "string":
                if (msg_id.length < 1) {
                    throw new ClientError("Invalid message ID provided (length = 0)");
                }

                break;
            default:
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

                if (!channel) {
                    return false;
                }

                break;
            case "object":
                channel = ch_id;
                break;
            default:
                throw new ClientError("Invalid channel or channel ID provided");
        }

        Util.setValuesWithDefaults(options, options, defaultMessageOptions);

        try {
            return await channel.messages.fetch(msg_id, {
                force: !options.cache
            });
        } catch (err) {
            if (err.code === RESTJSONErrorCodes.UnknownMessage) {
                return false;
            }

            throw err;
        }
    }

    async fetchMessages(ch_id, options = {}, fetchOptions = {}) {
        if (ch_id === null || typeof ch_id === "undefined") {
            throw new ClientError("No channel or channel ID provided");
        }

        Util.setValuesWithDefaults(options, options, defaultMessagesOptions);

        let channel;

        switch (typeof ch_id) {
            case "string":
                const channelOptions = {
                    checkAccess: options.checkAccess,
                    user_id: options.user_id
                };

                channel = await this.fetchChannel(ch_id, channelOptions);

                if (!channel) {
                    return false;
                }

                break;
            case "object":
                channel = ch_id;
                break;
            default:
                throw new ClientError("Invalid channel or channel ID");
        }

        Util.setValuesWithDefaults(fetchOptions, fetchOptions, defaultMessagesFetchOptions);
        fetchOptions.force = !options.cache;

        let messages;

        try {
            messages = await channel.messages.fetch(fetchOptions);
        } catch (err) {
            if (err instanceof DiscordAPIError) {
                return false;
            }

            throw err;
        }

        return messages;
    }

    async findUserById(user_id, options = {}) {
        if (user_id === null || typeof user_id === "undefined") {
            throw new ClientError("No user ID provided");
        }

        Util.setValuesWithDefaults(options, options, defaultUserOptions);

        let user;

        try {
            user = await this.client.users.fetch(user_id, {
                force: !options.cache
            });
        } catch (err) {
            if (err.code === RESTJSONErrorCodes.UnknownUser) {
                return false;
            }

            throw err;
        }

        return user;
    }

    async findUsers(query, options = {}, fetchOptions = {}) {
        if (query === null || typeof query === "undefined") {
            throw new ClientError("No query provided");
        }

        Util.setValuesWithDefaults(options, options, defaultUsersOptions);

        const guilds = this.client.guilds.cache;

        const idMatch = query.match(userIdRegex),
            mentionMatch = query.match(mentionRegex),
            userMatch = idMatch ?? mentionMatch;

        if (userMatch !== null) {
            const user_id = userMatch[1];

            for (const guild of guilds.values()) {
                const member = await this.fetchMember(guild, user_id);

                if (member) {
                    return [member];
                }
            }

            if (options.onlyMembers) {
                return [];
            }

            const user = await this.findUserById(user_id);

            if (user) {
                user.user = user;
                return [user];
            }

            return [];
        }

        if (!options.searchMembers) {
            return [];
        }

        Util.setValuesWithDefaults(fetchOptions, fetchOptions, defaultUsersFetchOptions);

        let members = [],
            foundIds = [];

        for (const guild of guilds.values()) {
            const guildMembers = await guild.members.fetch({
                query,
                limit: fetchOptions.fetchLimit
            });

            const newMembers = guildMembers.filter(user => !foundIds.includes(user.id)),
                memberIds = newMembers.keys();

            members.push(...newMembers.values());
            foundIds.push(...memberIds);
        }

        members = search(members, query, {
            maxResults: options.limit,
            minDist: options.searchMinDist,
            searchKey: "username"
        });

        return members;
    }

    killProcess() {
        if (typeof this.onKill === "function") {
            this.onKill();
        }

        process.exit(0);
    }
}

export default DiscordClient;
