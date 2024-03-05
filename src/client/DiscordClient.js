import discord from "discord.js";
import URL from "url";
import path from "path";

import Util from "../util/Util.js";
import diceDist from "../util/diceDist.js";

import ClientError from "../errors/ClientError.js";

const { Client, GatewayIntentBits, PermissionsBitField, ActivityType, Partials } = discord;

const defaultIntents = [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.DirectMessages
    ],
    defaultPartials = [Partials.Channel];

class DiscordClient {
    constructor(intents, partials) {
        this.intents = intents ?? defaultIntents;
        this.partials = partials ?? defaultPartials;

        this.buildClient();
        this.events = [];

        this.loginTimeout = 60000;
        this.wrapEvents = true;
        this.eventsDir = "./events";
        this.eventFileExtension = ".js";
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
        this.loginTimeout = options.loginTimeout ?? this.loginTimeout;
        this.wrapEvents = options.wrapEvents ?? this.wrapEvents;
        this.eventsDir = options.eventsDir ?? this.eventsDir;
        this.eventFileExtension = options.eventFileExtension ?? this.eventFileExtension;
    }

    async login(token) {
        this.logger?.info("Logging in...");

        const login = new Promise((resolve, reject) => {
            this.client.login(token).catch(err => {
                this.logger?.error("Error occured while logging in:", err);
                reject(err);
            });

            Util.waitForCondition(_ => this.loggedIn, new ClientError("Login took too long"), this.loginTimeout)
                .then(resolve)
                .catch(reject);
        });

        await login;
    }

    async logout() {
        await this.client.destroy();
        delete this.client;

        this.loggedIn = false;
        this.logger?.info("Destroyed client.");
    }

    getEventPaths() {
        if (typeof this.eventsDir === "undefined") {
            return [];
        }

        let files = Util.getFilesRecSync(this.eventsDir);
        files = files.filter(file => {
            const extension = path.extname(file);
            return extension === this.eventFileExtension;
        });

        return files;
    }

    async loadEvent(eventPath) {
        eventPath = URL.pathToFileURL(eventPath);

        let event = await import(eventPath);
        event = event.default;

        if (typeof event === "undefined" || typeof event.name === "undefined") {
            return false;
        }

        let listener = event.listener;

        if (this.wrapEvents) {
            if (typeof this.wrapEvent === "undefined") {
                this.logger?.warn("Couldn't wrap event: " + event.name);
            } else {
                listener = this.wrapEvent(listener);
            }
        }

        if (event.once ?? false) {
            this.client.once(event.name, listener);
        } else {
            this.client.on(event.name, listener);
        }

        this.events.push(event.name);
        return true;
    }

    async loadEvents() {
        this.logger?.info("Loading events...");
        const paths = this.getEventPaths();

        if (paths.length === 0) {
            this.logger?.info("Couldn't find any events.");
            return;
        }

        let ok = 0,
            bad = 0;

        for (const eventPath of paths) {
            try {
                const res = await this.loadEvent(eventPath);

                if (res === true) {
                    ok++;
                }
            } catch (err) {
                this.logger?.error("loadEvents: " + eventPath, err);
                bad++;
            }
        }

        this.logger?.info(`Loaded ${ok + bad} events. ${ok} successful, ${bad} failed.`);
    }

    removeEvents() {
        for (let i = 0; i < this.events.length; i++) {
            this.client.removeAllListeners(this.events[i].name);
            delete this.events[i];
        }

        while (this.events.length > 0) {
            this.events.shift();
        }

        this.logger?.info("Removed all listeners.");
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

    getChannel(ch_id, user_id, check = true) {
        let channel;

        if (this.client.channels.cache.has(ch_id)) {
            channel = this.client.channels.cache.get(ch_id);
        } else {
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
        const channel = this.getChannel(ch_id, user_id, check);

        if (!channel || typeof msg_id !== "string") {
            return false;
        }

        try {
            return await channel.messages.fetch(msg_id);
        } catch (err) {
            if (err.constructor.name === "DiscordAPIError") {
                return false;
            }

            throw err;
        }
    }

    async fetchMessages(ch_id, options = {}, user_id, check) {
        const channel = this.getChannel(ch_id, user_id, check);

        if (!channel || typeof options !== "object") {
            return false;
        }

        options = Object.assign(
            {
                limit: 100
            },
            options
        );

        try {
            return await channel.messages.fetch(options);
        } catch (err) {
            if (err.constructor.name === "DiscordAPIError") {
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
        const idMatch = search.match(/(\d{17,20})/),
            mentionMatch = search.match(/<@(\d{17,20})>/);

        let guilds = this.client.guilds.cache;

        if (idMatch ?? mentionMatch) {
            const id = idMatch[1] ?? mentionMatch[1];

            for (let i = 0; i < guilds.size; i++) {
                let user;

                try {
                    user = await guilds.at(i).members.fetch({
                        user: id
                    });
                } catch (err) {
                    if (err.constructor.name !== "DiscordAPIError") {
                        throw err;
                    }
                }

                if (typeof user !== "undefined") {
                    return [user];
                }
            }
        }

        let users = [],
            ids = [];

        options = Object.assign(
            {
                limit: 10
            },
            options
        );

        for (let i = 0; i < guilds.size; i++) {
            let guildUsers = await guilds.at(i).members.fetch({
                query: search,
                limit: options.limit
            });

            guildUsers = guildUsers.filter(x => !ids.includes(x.id));
            ids.push(...guildUsers.map(x => x.id));

            guildUsers = guildUsers.map(x => [x, diceDist(x.username, search)]);
            users.push(...guildUsers);
        }

        users.sort((a, b) => b[1] - a[1]);
        users = users.slice(0, options.limit).map(x => x[0]);

        return users;
    }
}

export default DiscordClient;
