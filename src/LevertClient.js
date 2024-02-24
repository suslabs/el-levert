import discord from "discord.js";
import URL from "url";

import version from "../version.js";

import ClientError from "./errors/ClientError.js";
import Util from "./util/Util.js";

import createLogger from "./logger/CreateLogger.js";
import getDefaultLoggerConfig from "./logger/DefaultConfig.js";

import ReactionHandler from "./handlers/ReactionHandler.js";
import CommandHandler from "./handlers/CommandHandler.js";
import PreviewHandler from "./handlers/PreviewHandler.js";
import SedHandler from "./handlers/SedHandler.js";

import TagManager from "./managers/database/TagManager.js";
import PermissionManager from "./managers/database/PermissionManager.js";
import ReminderManager from "./managers/database/ReminderManager.js";

import Command from "./commands/Command.js";
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

        const { config, reactions, auth } = configs;
        this.config = config;
        this.reactions = reactions;

        token = auth.token;
        this.owner = auth.owner ?? "";

        this.events = [];
        this.commands = [];

        this.inProcessIds = [];

        this.setupLogger();
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

    loadCommand(cmd) {
        if (typeof cmd === "undefined" || typeof cmd.name === "undefined") {
            return;
        }

        cmd = new Command(cmd);

        if (typeof cmd.load !== "undefined") {
            cmd.load = wrapEvent(cmd.load.bind(cmd));
            const res = cmd.load();

            if (res === false) {
                return false;
            }
        }

        cmd.handler = cmd.handler.bind(cmd);
        this.commands.push(cmd);

        return true;
    }

    loadSubcommands() {
        this.commands.forEach(x => {
            if (x.isSubcmd || x.subcommands.length < 1) {
                return;
            }

            x.subcommands.forEach(n => {
                const find = this.commands.find(y => {
                    return y.name === n && y.parent === x.name;
                });

                if (typeof find === "undefined") {
                    this.logger.warn(`Subcommand "${n}" of command "${x.name}" not found.`);
                    return;
                }

                find.parentCmd = x;
                x.subcmds.set(find.name, find);
            });
        });
    }

    async loadCommands() {
        this.logger.info("Loading commands...");

        let ok = 0,
            bad = 0;

        const cmdsPath = this.config.commandsPath,
            files = Util.getFilesRecSync(cmdsPath).filter(file => file.endsWith(".js"));

        for (const file of files) {
            try {
                let cmd = await import(URL.pathToFileURL(file));
                cmd = cmd.default;

                if (this.loadCommand(cmd)) {
                    ok++;
                }
            } catch (err) {
                this.logger.error("loadEvents: " + file, err);
                bad++;
            }
        }

        this.logger.info(`Loaded ${ok + bad} commands. ${ok} successful, ${bad} failed.`);
        this.loadSubcommands();
    }

    loadHandlers() {
        const handlers = {
            commandHander: new CommandHandler(),
            previewHandler: new PreviewHandler(),
            reactionHandler: new ReactionHandler(),
            sedHander: new SedHandler()
        };

        this.handlers = handlers;
        this.handlerList = Object.values(handlers);
    }

    async loadManagers() {
        const tagManager = new TagManager(),
            permManager = new PermissionManager();

        this.tagManager = tagManager;
        this.permManager = permManager;

        await tagManager.loadDatabase();
        await permManager.loadDatabase();

        if (this.config.enableReminders) {
            const remindManager = new ReminderManager();
            this.remindManager = remindManager;

            await remindManager.loadDatabase();
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

    isProcessing(msg_id) {
        return this.inProcessIds.includes(msg_id);
    }

    addId(msg_id) {
        this.inProcessIds.push(msg_id);
    }

    removeId(msg_id) {
        this.inProcessIds = this.inProcessIds.filter(x => x !== msg_id);
    }

    async executeAllHandlers(func, msg, ...args) {
        if (this.isProcessing(msg.id)) {
            return;
        }

        this.addId(msg.id);

        for (const handler of this.handlerList) {
            const handlerFunc = handler[func].bind(handler),
                out = await handlerFunc(msg, ...args);

            if (out) {
                this.removeId(msg.id);
                return;
            }
        }
    }

    async start() {
        this.loadHandlers();
        await this.loadManagers();

        await this.loadEvents();
        await this.loadCommands();

        this.tagVM = new TagVM();
        this.tagVM2 = new TagVM2();

        if (this.config.enableOtherLangs) {
            this.externalVM = new ExternalVM();
        }

        await this.login(token);
        this.setActivity(this.config.activity);

        if (this.config.enableReminders) {
            setInterval(this.remindManager.sendReminders.bind(this.remindManager), 1000);
            this.logger.info("Started reminder loop.");
        }

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

export { LevertClient, getClient, getLogger };
