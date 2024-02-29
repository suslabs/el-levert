import DiscordClient from "./client/DiscordClient.js";
import version from "../version.js";

import ClientError from "./errors/ClientError.js";

import createLogger from "./logger/CreateLogger.js";
import getDefaultLoggerConfig from "./logger/DefaultConfig.js";

import wrapEvent from "./client/wrapEvent.js";
import executeAllHandlers from "./client/executeAllHandlers.js";
import { registerGlobalHandler } from "./client/registerGlobalHandler.js";

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

class LevertClient extends DiscordClient {
    constructor(configs) {
        super();

        if (client) {
            throw new ClientError("The client can only be constructed once.");
        } else {
            client = this;
        }

        this.setConfigs(configs);
        this.setupLogger();

        this.wrapEvent = wrapEvent.bind(undefined, this.logger);

        this.started = false;
    }

    setConfigs(configs) {
        this.version = version;

        const { config, reactions, auth } = configs;
        this.config = config;
        this.reactions = reactions;

        token = auth.token;
        this.owner = auth.owner ?? "";

        this.setEventsDir(config.eventsPath);
    }

    setupLogger() {
        if (typeof this.logger !== "undefined") {
            this.logger.end();
            delete this.logger;
        }

        const config = getDefaultLoggerConfig("El Levert", true, true, this.config.logFile);
        this.logger = createLogger(config);
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

        this.managers = managers;

        for (const [name, manager] of Object.entries(managers)) {
            this[name] = manager;
            await manager.load();

            this.logger.info(`Loaded manager: ${manager.constructor.name}`);
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

        if (this.config.setActivity) {
            this.setActivity(this.config.activity);
        }

        this.reminderManager.setSendInterval();

        if (this.config.enableGlobalHandler) {
            registerGlobalHandler(this.logger);
            this.logger.info("Registered global error hander.");
        }

        this.started = true;
        this.logger.info("Startup complete.");
    }
}

let token, client;

function getClient() {
    return client;
}

function getLogger() {
    return client.logger;
}

export { LevertClient, getClient, getLogger };
