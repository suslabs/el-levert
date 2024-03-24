import discord from "discord.js";

import ClientError from "../errors/ClientError.js";
import EventLoader from "../loaders/event/EventLoader.js";

import Util from "../util/Util.js";
import diceDist from "../util/search/diceDist.js";

const {
    Client,
    DiscordAPIError,
    RESTJSONErrorCodes,
    GatewayIntentBits,
    Partials,
    ActivityType,
    PermissionsBitField,
    ChannelType
} = discord;

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

const defaultMessageFetchOptions = {
        limit: 100
    },
    defaultUserFetchOptions = {
        fetchLimit: 100,
        limit: 100
    };

class DiscordClient {
    constructor(intents, partials) {
        this.intents = intents ?? defaultIntents;
        this.partials = partials ?? defaultPartials;

        this.buildClient();

        this.wrapEvents = false;
        this.eventsDir = "";

        this.loginTimeout = 60000;

        this.onLogout = _ => {};
        this.onKill = _ => {};
    }

    buildClient() {
        if (typeof this.client !== "undefined") {
            new ClientError("Can't create a new client without disposing the old one");
        }

        this.logger?.info("Creating client...");

        const options = {
            intents: this.intents,
            partials: this.partials
        };

        const client = new Client(options);
        this.client = client;
        this.loggedIn = false;
    }

    setOptions(options) {
        for (const key in options) {
            if (typeof this[key] === "undefined") {
                throw new ClientError("Invalid option: " + key);
            }

            if (typeof options[key] === "function") {
                options[key] = options[key].bind(this);
            }

            this[key] = options[key] ?? this[key];
        }
    }

    async login(token, exitOnFailure = false) {
        this.logger?.info("Logging in...");

        const promise = new Promise((resolve, reject) => {
            this.client.login(token).catch(err => {
                if (!exitOnFailure) {
                    reject(err);
                }

                this.logger?.error("Error occured while logging in:", err);
                resolve(false);
            });

            Util.waitForCondition(_ => this.loggedIn, new ClientError("Login took too long"), this.loginTimeout)
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

        const res = await promise;

        if (exitOnFailure && !res) {
            this.killProcess();
        }
    }

    onReady() {
        this.loggedIn = true;
        this.logger?.info(`The bot is online. Logged in as "${this.client.user.username}".`);
    }

    async logout(kill = false) {
        this.onLogout();

        await this.client.destroy();
        delete this.client;

        this.loggedIn = false;
        this.logger?.info("Destroyed client.");

        if (kill) {
            this.killProcess();
        }
    }

    killProcess() {
        this.onKill();
        process.exit(0);
    }

    async loadEvents() {
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
            throw new ClientError("Can't unload events, events weren't loaded.");
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
            this.logger?.error(`Invalid activity type: ${activityType}\nValid types are: ${validTypes.join(" ")}`);
            return;
        }

        if (typeof config.text === "undefined") {
            this.logger?.error("Invalid activity text.");
            return;
        }

        const presence = this.client.user.setActivity(config.text, {
                type: num
            }),
            activity = presence.activities[0];

        const setType = ActivityType[activity.type],
            setText = activity.name;

        this.logger?.info(`Set activity status: "${setType} ${setText}"`);
    }

    async getChannel(ch_id, user_id, checkAccess = true) {
        let channel;

        try {
            channel = await this.client.channels.fetch(ch_id);
        } catch (err) {
            if (err.code === RESTJSONErrorCodes.UnknownChannel || err.code === RESTJSONErrorCodes.MissingAccess) {
                return false;
            }

            throw err;
        }

        if (!checkAccess) {
            return channel;
        }

        if (typeof user_id === "undefined") {
            throw new ClientError("No user id provided");
        }

        switch (channel.type) {
            case ChannelType.DM:
                if (channel.recipient.id !== user_id) {
                    return false;
                }

                break;
            default:
                const perms = channel.permissionsFor(user_id);

                if (perms === null || !perms.has(PermissionsBitField.Flags.ViewChannel)) {
                    return false;
                }

                break;
        }

        return channel;
    }

    async fetchMessage(ch_id, msg_id, user_id, checkAccess) {
        if (typeof ch_id === "undefined") {
            throw new ClientError("No channel id provided");
        }

        if (typeof msg_id === "undefined") {
            throw new ClientError("No message id provided");
        }

        const channel = await this.getChannel(ch_id, user_id, checkAccess);

        if (!channel) {
            return false;
        }

        try {
            return await channel.messages.fetch(msg_id);
        } catch (err) {
            if (err.code === RESTJSONErrorCodes.UnknownChannel) {
                return false;
            }

            throw err;
        }
    }

    async fetchMessages(ch_id, options = {}, user_id, checkAccess) {
        if (typeof ch_id === "undefined") {
            throw new ClientError("No channel id provided");
        }

        const channel = await this.getChannel(ch_id, user_id, checkAccess);

        if (!channel) {
            return false;
        }

        Object.assign(options, {
            ...defaultMessageFetchOptions,
            ...options
        });

        try {
            return await channel.messages.fetch(options);
        } catch (err) {
            if (err instanceof DiscordAPIError) {
                return false;
            }

            throw err;
        }
    }

    async findUserById(id) {
        let user;

        try {
            user = await this.client.users.fetch(id);
        } catch (err) {
            if (err.code === RESTJSONErrorCodes.UnknownUser) {
                return false;
            }

            throw err;
        }

        return user;
    }

    async findUsers(search, options = {}) {
        Object.assign(options, {
            ...defaultUserFetchOptions,
            ...options
        });

        const guilds = this.client.guilds.cache;

        const idMatch = search.match(userIdRegex),
            mentionMatch = search.match(mentionRegex);

        if (idMatch ?? mentionMatch) {
            const id = idMatch[1] ?? mentionMatch[1];

            for (let i = 0; i < guilds.size; i++) {
                try {
                    const user = await guilds.at(i).members.fetch({ user: id });
                    return [user];
                } catch (err) {
                    if (err.code !== RESTJSONErrorCodes.UnknownUser) {
                        throw err;
                    }
                }
            }

            const user = await this.client.users.fetch(id);
            user.user = user;

            return [user];
        }

        let users = [],
            foundIds = [];

        for (let i = 0; i < guilds.size; i++) {
            let guildUsers = await guilds.at(i).members.fetch({
                query: search,
                limit: options.fetchLimit
            });

            guildUsers = guildUsers.filter(x => !foundIds.includes(x.id));
            foundIds.push(...guildUsers.map(x => x.id));

            guildUsers = guildUsers.map(x => [x, diceDist(x.username, search)]);
            users.push(...guildUsers);
        }

        users.sort((a, b) => b[1] - a[1]);
        users = users.slice(0, options.limit).map(x => x[0]);

        return users;
    }
}

export default DiscordClient;
