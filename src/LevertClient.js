import DiscordClient from "./client/DiscordClient.js";
import ClientError from "./errors/ClientError.js";

import version from "../version.js";

import createLogger from "./logger/CreateLogger.js";
import getDefaultLoggerConfig from "./logger/DefaultConfig.js";

import wrapEvent from "./client/wrapEvent.js";
import executeAllHandlers from "./client/executeAllHandlers.js";
import { registerGlobalErrorHandler, removeGlobalErrorHandler } from "./client/GlobalErrorHandler.js";

import ReactionHandler from "./handlers/ReactionHandler.js";
import CommandHandler from "./handlers/CommandHandler.js";
import PreviewHandler from "./handlers/PreviewHandler.js";
import SedHandler from "./handlers/SedHandler.js";

import MessageProcessor from "./client/MessageProcessor.js";

import CommandManager from "./managers/command/CommandManager.js";
import TagManager from "./managers/database/TagManager.js";
import PermissionManager from "./managers/database/PermissionManager.js";
import ReminderManager from "./managers/database/ReminderManager.js";
import CLICommandManager from "./managers/command/CLICommandManager.js";

import TagVM from "./vm/isolated-vm/TagVM.js";
import TagVM2 from "./vm/vm2/TagVM2.js";
import ExternalVM from "./vm/judge0/ExternalVM.js";

class LevertClient extends DiscordClient {
    constructor(configs) {
        super();

        if (client) {
            throw new ClientError("The client can only be constructed once");
        } else {
            client = this;
        }

        this.version = version;
        this.started = false;

        this.setConfigs(configs);
        this.setupLogger();
    }

    setConfigs(configs) {
        if (typeof configs === "undefined") {
            throw new ClientError("Config cannot be undefined");
        }

        const { config, reactions, auth } = configs;
        this.config = config;
        this.reactions = reactions;

        token = auth.token;
        this.owner = auth.owner;

        this.setOptions({
            wrapEvents: this.config.wrapEvents,
            eventsDir: config.eventsPath
        });
    }

    setupLogger() {
        if (typeof this.logger !== "undefined") {
            this.deleteLogger();
        }

        const config = getDefaultLoggerConfig("El Levert", true, true, this.config.logFile);
        this.logger = createLogger(config);

        this.wrapEvent = wrapEvent.bind(undefined, this.logger);
    }

    deleteLogger() {
        if (typeof this.logger === "undefined") {
            return;
        }

        this.logger.end();

        delete this.logger;
        delete this.wrapEvent;
    }

    loadHandlers() {
        this.logger.info("Loading handlers...");

        const handlers = {
            commandHandler: new CommandHandler(),
            previewHandler: new PreviewHandler(),
            reactionHandler: new ReactionHandler(),
            sedHandler: new SedHandler()
        };

        this.handlers = handlers;
        this.handlerList = Object.values(handlers);

        for (const [name, handler] of Object.entries(handlers)) {
            handler.load();

            Object.defineProperty(this, name, {
                value: handler,
                configurable: true
            });

            this.logger.info(`Loaded handler: ${name}`);
        }

        this.executeAllHandlers = executeAllHandlers.bind(undefined, this);
        this.messageProcessor = new MessageProcessor(this);

        this.logger.info("Loaded handlers.");
    }

    unloadHandlers() {
        this.logger.info("Unloading handlers...");

        for (const name in this.handlers) {
            this.handlers[name].unload();

            delete this.handlers[name];
            delete this[name];
        }

        for (let i = 0; i < this.handlerList.length; i++) {
            delete this.handlerList[i];
        }

        delete this.handlers;
        delete this.handlerList;

        delete this.executeAllHandlers;
        delete this.messageProcessor;

        this.logger.info("Unloaded handlers.");
    }

    async loadManagers() {
        this.logger.info("Loading managers...");

        const managers = {
            tagManager: new TagManager(),
            permManager: new PermissionManager(this.config.enablePermissions),
            commandManager: new CommandManager(),
            reminderManager: new ReminderManager(this.config.enableReminders),
            cliCommandManager: new CLICommandManager(this.config.enableCliCommands)
        };

        this.managers = managers;
        this.managerList = Object.values(managers);

        for (const [name, manager] of Object.entries(managers)) {
            this.logger.info(`Loading manager: ${name}`);

            await manager.load();

            Object.defineProperty(this, name, {
                value: manager,
                configurable: true
            });

            this.logger.info(`Loaded manager: ${name}`);
        }
    }

    async unloadManagers() {
        this.logger.info("Unloading managers...");

        for (const name in this.managers) {
            this.logger.info(`Unloading manager: ${name}`);

            await this.managers[name].unload();

            delete this.managers[name];
            delete this[name];

            this.logger.info(`Unloaded manager: ${name}`);
        }

        for (let i = 0; i < this.managerList.length; i++) {
            delete this.managerList[i];
        }

        delete this.managers;
        delete this.managerList;

        this.logger.info("Unloaded managers.");
    }

    loadVMs() {
        this.tagVM = new TagVM();
        this.tagVM2 = new TagVM2();

        if (this.config.enableOtherLangs) {
            this.externalVM = new ExternalVM();
        }
    }

    unloadVMs() {
        delete this.tagVM;

        if (this.tagVM2.kill()) {
            this.logger.info("Killed VM2 child process.");
            delete this.tagVM2;
        }

        if (this.config.enableOtherLangs) {
            delete this.externalVM;
        }
    }

    async start() {
        if (this.started) {
            throw new ClientError("The client can only be started once");
        }

        this.logger.info("Starting client...");

        await this.loadManagers();
        this.loadHandlers();

        await this.loadEvents();

        this.loadVMs();

        await this.login(token, true);

        if (this.config.setActivity) {
            this.setActivity(this.config.activity);
        }

        this.reminderManager.startSendLoop();

        if (this.config.enableGlobalHandler) {
            registerGlobalErrorHandler(this.logger);
            this.logger.info("Registered global error handler.");
        }

        this.started = true;
        this.logger.info("Startup complete.");
    }

    async stop(kill = false) {
        if (!this.started) {
            throw new ClientError("The client can't be stopped if it hasn't been started");
        }

        this.logger.info("Stopping client...");

        if (this.config.enableGlobalHandler) {
            removeGlobalErrorHandler();
            this.logger.info("Removed global error handler.");
        }

        this.unloadEvents();

        this.unloadHandlers();
        await this.unloadManagers();

        this.unloadVMs();

        await this.logout(kill);

        this.started = false;
        this.logger.info("Client stopped.");
    }

    async restart(configs) {
        if (!this.started) {
            throw new ClientError("The client can't be restarted if it hasn't been started");
        }

        this.logger.info("Restarting client...");

        await this.stop();

        switch (typeof configs) {
            case "object":
                this.setConfigs(configs);
                break;
            case "function":
                const obj = await configs();
                this.setConfigs(obj);

                break;
        }

        this.buildClient();
        await this.start();
    }

    onKill() {
        this.deleteLogger();
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
