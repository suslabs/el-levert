import DiscordClient from "./client/DiscordClient.js";
import ClientError from "./errors/ClientError.js";

import version from "../version.js";

import createLogger from "./logger/createLogger.js";
import getDefaultLoggerConfig from "./logger/DefaultLoggerConfig.js";
import ChannelTransport from "./logger/discord/ChannelTransport.js";
import WebhookTransport from "./logger/discord/WebhookTransport.js";
import getDefaultDiscordConfig from "./logger/discord/DefaultDiscordConfig.js";

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

let token, client;

class LevertClient extends DiscordClient {
    constructor(configs) {
        super();

        if (client) {
            throw new ClientError("The client can only be constructed once");
        } else {
            client = this;
        }

        this.version = version;

        this.setConfigs(configs);
        this.setupLogger();

        this.setStopped();
    }

    get uptime() {
        if (!this.started) {
            return 0;
        }

        return Date.now() - this.startedAt;
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
            eventsDir: config.eventsPath,
            pingReply: config.pingReply,
            mentionUsers: config.mentionUsers
        });
    }

    setupLogger() {
        if (typeof this.logger !== "undefined") {
            this.deleteLogger();
        }

        const name = "El Levert",
            configOpts = [name, true, true, this.config.logFile, this.config.logLevel],
            config = getDefaultLoggerConfig(...configOpts);

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

    addDiscordTransports() {
        if (!this.config.logToDiscord) {
            return;
        }

        this.logger.info("Adding Discord transport...");

        const useChannel = this.config.logChannelId !== "",
            useWebhook = this.config.logWebhook !== "";

        if (!useChannel && !useWebhook) {
            this.logger.error("If logging to Discord is enabled, a channel id or a webhook url must be provided.");
            return;
        }

        const commonOpts = {
            ...getDefaultDiscordConfig(this.config.discordLogLevel),
            client: this.client
        };

        if (useChannel) {
            try {
                const transport = new ChannelTransport({
                    ...commonOpts,
                    channelId: this.config.logChannelId
                });

                this.logger.add(transport);
            } catch (err) {
                this.logger.error("Couldn't add channel transport:", err);
            }
        }

        if (useWebhook) {
            try {
                const transport = new WebhookTransport({
                    ...commonOpts,
                    url: this.config.logWebhook
                });

                this.logger.add(transport);
            } catch (err) {
                this.logger.error("Couldn't add webhook transport:", err);
            }
        }
    }

    removeDiscordTransports() {
        const channelTransport = this.logger.transports.find(x => x.name === "discord.channel"),
            webhookTransport = this.logger.transports.find(x => x.name === "discord.webhook");

        if (typeof channelTransport !== "undefined") {
            this.logger.remove(channelTransport);
        }

        if (typeof webhookTransport !== "undefined") {
            this.logger.remove(webhookTransport);
        }
    }

    silenceDiscordTransports(silent = true) {
        const channelTransport = this.logger.transports.find(x => x.name === "discord.channel"),
            webhookTransport = this.logger.transports.find(x => x.name === "discord.webhook");

        if (typeof channelTransport !== "undefined") {
            channelTransport.silent = silent;
        }

        if (typeof webhookTransport !== "undefined") {
            webhookTransport.silent = silent;
        }
    }

    loadHandlers() {
        this.logger.info("Loading handlers...");

        const handlers = {
            commandHandler: new CommandHandler(),
            previewHandler: new PreviewHandler(this.config.enablePreviews),
            reactionHandler: new ReactionHandler(this.reactions.enableReacts),
            sedHandler: new SedHandler(this.config.enableSed)
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
        getLogger().info("Loading VMs...");

        this.tagVM = new TagVM(this.config.enableEval);
        this.tagVM.setupInspectorServer();

        this.tagVM2 = new TagVM2(this.config.enableVM2);

        if (this.config.enableOtherLangs) {
            this.externalVM = new ExternalVM();
        }

        getLogger().info("Loaded VMs.");
    }

    unloadVMs() {
        getLogger().info("Unloading VMs...");

        this.tagVM.unload();
        delete this.tagVM;

        if (this.tagVM2.kill()) {
            this.logger.info("Killed VM2 child process.");
        }

        delete this.tagVM2;

        if (this.config.enableOtherLangs) {
            delete this.externalVM;
        }

        getLogger().info("Unloaded VMs.");
    }

    async setActivityFromConfig() {
        if (!this.config.setActivity) {
            return;
        }

        try {
            await this.setActivity(this.config.activity);
        } catch (err) {
            this.logger.error("Error occured while setting activity:", err);
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

        await this.setActivityFromConfig();
        this.reminderManager.startSendLoop();

        if (this.config.enableGlobalHandler) {
            registerGlobalErrorHandler(this.logger);
        }

        this.setStarted();
        this.addDiscordTransports();

        this.logger.info("Startup complete.");
    }

    async stop(kill = false) {
        if (!this.started) {
            throw new ClientError("The client can't be stopped if it hasn't been started already");
        }

        this.logger.info("Stopping client...");
        this.removeDiscordTransports();

        if (this.config.enableGlobalHandler) {
            removeGlobalErrorHandler();
        }

        this.unloadEvents();

        this.unloadHandlers();
        await this.unloadManagers();

        this.unloadVMs();

        this.logout(kill);
        this.setStopped();

        this.logger.info("Client stopped.");
    }

    async restart(configs) {
        if (!this.started) {
            throw new ClientError("The client can't be restarted if it hasn't been started already");
        }

        this.logger.info("Restarting client...");
        this.silenceDiscordTransports(true);

        await this.stop();
        this.buildClient();

        switch (typeof configs) {
            case "object":
                this.setConfigs(configs);
                break;
            case "function":
                const obj = await configs();
                this.setConfigs(obj);

                break;
        }

        await this.start();
    }

    onKill() {
        this.deleteLogger();
    }

    setStopped() {
        this.started = false;
        this.startedAt = -1;
    }

    setStarted() {
        this.started = true;
        this.startedAt = Date.now();
    }
}

function getClient() {
    return client;
}

function getLogger() {
    return client.logger;
}

export { LevertClient, getClient, getLogger };
