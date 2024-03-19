import discord from "discord.js-selfbot-v13";

import ClientError from "../errors/ClientError.js";
import EventLoader from "./EventLoader.js";

import Util from "../util/Util.js";
import diceDist from "../util/diceDist.js";

const { Client, Intents, PermissionsBitField, ActivityType, DiscordAPIError } = discord;

const defaultIntents = [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.MESSAGE_CONTENT,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_INVITES,
    Intents.FLAGS.DIRECT_MESSAGES
];

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
    constructor(intents) {
        this.intents = intents ?? defaultIntents;

        this.buildClient();

        this.wrapEvents = false;
        this.eventsDir = "";

        this.loginTimeout = 60000;
        this.onKill = _ => {};
    }

    buildClient() {
        if (typeof this.client !== "undefined") {
            new ClientError("Can't create a new client without disposing the old one");
        }

        this.logger?.info("Creating client...");

        const options = {
            intents: this.intents
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

    setActivity(config) {
        if (typeof config === "undefined") {
            return;
        }

        if (!Object.keys(ActivityType).includes(config.type)) {
            throw new ClientError("Invalid activity type: " + config.type);
        }

        if (typeof config.text !== "undefined") {
            this.client.user.setActivity(config.text, {
                type: ActivityType[config.type]
            });
        } else {
            throw new ClientError("Invalid activity text.");
        }

        this.logger?.info("Set activity status.");
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

    async logout(kill = false) {
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
        const eventLoader = new EventLoader(this.client, this.eventsDir, {
            logger: this.logger,
            wrapFunc: this.wrapEvent,
            wrapEvents: this.wrapEvents
        });

        await eventLoader.loadEvents();
        this.eventLoader = eventLoader;
    }

    unloadEvents() {
        if (typeof this.eventLoader === "undefined") {
            throw new ClientError("Can't unload events, events weren't loaded.");
        }

        this.eventLoader.removeListeners();
        delete this.eventLoader;
    }

    async getChannel(ch_id, user_id, check = true) {
        const channel = await this.client.channels.fetch(ch_id);

        if (typeof channel === "undefined") {
            return false;
        }

        if (check) {
            const perms = channel.permissionsFor(user_id);

            if (perms === null || !perms.has(PermissionsBitField.Flags.ViewChannel)) {
                return false;
            }
        }

        return channel;
    }

    async fetchMessage(ch_id, msg_id, user_id, check) {
        const channel = await this.getChannel(ch_id, user_id, check);

        if (!channel) {
            return false;
        }

        try {
            return await channel.messages.fetch(msg_id);
        } catch (err) {
            if (err instanceof DiscordAPIError) {
                return false;
            }

            throw err;
        }
    }

    async fetchMessages(ch_id, options = {}, user_id, check) {
        const channel = await this.getChannel(ch_id, user_id, check);

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
        const user = await this.client.users.fetch(id);

        if (typeof user === "undefined") {
            return false;
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
                    if (!(err instanceof DiscordAPIError)) {
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
