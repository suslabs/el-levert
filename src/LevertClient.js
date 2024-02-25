import discord from "discord.js";
import URL from "url";

import version from "../version.js";

import ClientError from "./errors/ClientError.js";
import Util from "./util/Util.js";

import createLogger from "./logger/CreateLogger.js";
import getDefaultLoggerConfig from "./logger/DefaultConfig.js";

import executeAllHandlers from "./handlers/executeAllHandlers.js";
import ReactionHandler from "./handlers/ReactionHandler.js";
import CommandHandler from "./handlers/CommandHandler.js";
import PreviewHandler from "./handlers/PreviewHandler.js";
import SedHandler from "./handlers/SedHandler.js";

import CommandManager from "./managers/command/CommandManager.js";
import TagManager from "./managers/database/TagManager.js";
import PermissionManager from "./managers/database/PermissionManager.js";
import ReminderManager from "./managers/database/ReminderManager.js";

import TagVM from "./vm/isolated-vm/TagVM.js";
import TagVM2 from "./vm/vm2/TagVM2.js";
import ExternalVM from "./vm/judge0/ExternalVM.js";

const { Client, GatewayIntentBits, PermissionsBitField, ActivityType, Partials } = discord;

const intents = [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.DirectMessages
    ],
    partials = [Partials.Channel];

class LevertClient extends Client {
    constructor(configs) {
        super({
            intents: intents,
            partials: partials
        });

        if (client) {
            throw new ClientError("The client can only be constructed once.");
        } else {
            client = this;
        }

        this.version = version;
        this.setConfigs(configs);

        this.handlers = {};
        this.handlerList = [];

        this.events = [];

        this.setupLogger();
    }

    setConfigs(configs) {
        const { config, reactions, auth } = configs;
        this.config = config;
        this.reactions = reactions;

        token = auth.token;
        this.owner = auth.owner ?? "";
    }

    setupLogger() {
        if (typeof this.logger !== "undefined") {
            this.logger.end();
            delete this.logger;
        }

        const config = getDefaultLoggerConfig("El Levert", true, true, this.config.logFile);
        this.logger = createLogger(config);
    }

    async loadEvents() {
        this.logger.info("Loading events...");

        let ok = 0,
            bad = 0;

        const eventsPath = this.config.eventsPath,
            files = Util.getFilesRecSync(eventsPath).filter(file => file.endsWith(".js"));

        for (const file of files) {
            try {
                let event = await import(URL.pathToFileURL(file));
                event = event.default;

                if (typeof event === "undefined" || typeof event.name === "undefined") {
                    continue;
                }

                const listener = wrapEvent(event.listener);

                if (event.once ?? false) {
                    this.once(event.name, listener);
                } else {
                    this.on(event.name, listener);
                }

                this.events.push(event.name);
                ok++;
            } catch (err) {
                this.logger.error("loadEvents: " + file, err);
                bad++;
            }
        }

        this.logger.info(`Loaded ${ok + bad} events. ${ok} successful, ${bad} failed.`);
    }

    loadHandlers() {
        this.logger.info("Loading handlers...");

        const handlers = {
            commandHander: new CommandHandler(),
            previewHandler: new PreviewHandler(),
            reactionHandler: new ReactionHandler(),
            sedHander: new SedHandler()
        };

        this.handlers = handlers;
        this.handlerList = Object.values(handlers);

        this.executeAllHandlers = executeAllHandlers.bind(undefined, this);
    }

    async loadManagers() {
        this.logger.info("Loading managers...");

        const managers = {
            commandManager: new CommandManager(),
            tagManager: new TagManager(),
            permManager: new PermissionManager(this.config.enablePermissions),
            reminderManager: new ReminderManager(this.config.enableReminders)
        };

        for (const [name, manager] of Object.entries(managers)) {
            this[name] = manager;
            await manager.load();

            this.logger.info(`Loaded manager: ${manager.constructor.name}`);
        }
    }

    getChannel(ch_id, user_id, check = true) {
        let channel;
        if (this.channels.cache.has(ch_id)) {
            channel = this.channels.cache.get(ch_id);
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
        const user = await this.users.fetch(id);

        if (typeof user === "undefined") {
            return false;
        }

        return user;
    }

    async findUsers(search, options = {}) {
        const idMatch = search.match(/(\d{17,20})/),
            mentionMatch = search.match(/<@(\d{17,20})>/);

        let guilds = this.guilds.cache;

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

            guildUsers = guildUsers.map(x => [x, Util.diceDist(x.username, search)]);
            users.push(...guildUsers);
        }

        users.sort((a, b) => b[1] - a[1]);
        users = users.slice(0, options.limit).map(x => x[0]);

        return users;
    }

    setActivity(config) {
        if (typeof config !== "undefined") {
            if (!Object.keys(ActivityType).includes(config.type)) {
                throw new ClientError("Invalid activity type: " + config.type);
            }

            if (typeof config.text !== "undefined") {
                this.user.setActivity(config.text, {
                    type: ActivityType[config.type]
                });
            } else {
                throw new ClientError("Invalid activity text.");
            }
        }
    }

    async start() {
        this.logger.info("Starting client...");

        await this.loadManagers();
        this.loadHandlers();

        await this.loadEvents();

        this.tagVM = new TagVM();
        this.tagVM2 = new TagVM2();

        if (this.config.enableOtherLangs) {
            this.externalVM = new ExternalVM();
        }

        await this.login(token);
        this.setActivity(this.config.activity);

        this.reminderManager.setSendInterval();

        if (this.config.enableGlobalHandler) {
            registerGlobalHandler();
        }
    }
}

let token, client;

function getClient() {
    return client;
}

function getLogger() {
    return client.logger;
}

const wrapEvent = callback =>
    function (...args) {
        try {
            const out = callback(...args);

            if (typeof out === "object" && typeof out.then === "function") {
                out.catch(err => client.logger.error(err));
            }

            return out;
        } catch (err) {
            console.log(client);
            client.logger.error(err);
        }
    };

function registerGlobalHandler() {
    process.on("uncaughtException", function (err1) {
        try {
            getLogger().error("Uncaught exception:", err1);
        } catch (err2) {
            console.error("Error occured while reporting uncaught error:", err2);
            console.error("Uncaught error:", err1);
        }
    });
}

export { LevertClient, getClient, getLogger, wrapEvent };
