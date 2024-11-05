import DiscordClient from "./client/DiscordClient.js";
import ClientError from "./errors/ClientError.js";

import version from "../version.js";

import createLogger from "./logger/createLogger.js";
import getDefaultLoggerConfig from "./logger/DefaultLoggerConfig.js";
import ChannelTransport from "./logger/discord/ChannelTransport.js";
import WebhookTransport from "./logger/discord/WebhookTransport.js";
import getDefaultDiscordConfig from "./logger/discord/DefaultDiscordConfig.js";

import Managers from "./managers/index.js";
import Handlers from "./handlers/index.js";
import VMs from "./vm/index.js";

import wrapEvent from "./client/wrapEvent.js";
import executeAllHandlers from "./client/executeAllHandlers.js";
import { registerGlobalErrorHandler, removeGlobalErrorHandler } from "./client/GlobalErrorHandler.js";

import MessageProcessor from "./client/MessageProcessor.js";

import Util from "./util/Util.js";
import { isPromise } from "./util/TypeTester.js";

let token, client;

const minPriority = -999,
    maxPriority = 999;

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

        this.components = new Map();

        this.setupLogger();

        this.setStopped();
    }

    get uptime() {
        if (!this.started) {
            return 0;
        }

        return Util.timeDelta(this.startedAt, Date.now());
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

        this.logger.info("Adding Discord transport(s)...");

        const useChannel = this.config.logChannelId !== "",
            useWebhook = this.config.logWebhook !== "";

        if (!useChannel && !useWebhook) {
            this.logger.error("Can't add Discord transports. No channel id or a webhook url was provided.");
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

                this.logger.info("Added channel transport.");
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

                this.logger.info("Added webhook transport.");
                this.logger.add(transport);
            } catch (err) {
                this.logger.error("Couldn't add webhook transport:", err);
            }
        }
    }

    getDiscordTransports() {
        const channelTransport = this.logger.transports.find(x => x.name === ChannelTransport.$name),
            webhookTransport = this.logger.transports.find(x => x.name === WebhookTransport.$name);

        return [channelTransport, webhookTransport];
    }

    removeDiscordTransports() {
        const [channelTransport, webhookTransport] = this.getDiscordTransports();

        if (typeof channelTransport !== "undefined") {
            this.logger.remove(channelTransport);
        }

        if (typeof webhookTransport !== "undefined") {
            this.logger.remove(webhookTransport);
        }
    }

    silenceDiscordTransports(silent = true) {
        const [channelTransport, webhookTransport] = this.getDiscordTransports();

        if (typeof channelTransport !== "undefined") {
            channelTransport.silent = silent;
        }

        if (typeof webhookTransport !== "undefined") {
            webhookTransport.silent = silent;
        }
    }

    loadComponent(name, barrel, ctorArgs = {}, options = {}) {
        let compInfo = this.components.get(name) ?? {};

        if (compInfo.loaded ?? false) {
            throw new ClientError(`"${name}" component is already loaded`);
        }

        const pluralName = options.pluralName ?? name + "s",
            listName = name + "List";

        const showLogMessages = options.showLogMessages ?? true,
            showLoadingMessages = options.showLoadingMessages ?? true;

        if (showLogMessages) {
            this.logger.info(`Loading ${pluralName}...`);
        }

        const components = Object.entries(barrel);
        components.forEach(([compName, compClass]) => {
            if (Util.outOfRange(minPriority, maxPriority, compClass.loadPriority)) {
                throw new ClientError(`Invalid load priority ${compClass.loadPriority} for component ${compName}`);
            } else {
                compClass.loadPriority ??= maxPriority;
            }
        });
        components.sort(([_1, a], [_2, b]) => a.loadPriority - b.loadPriority);

        const compInstances = components
            .filter(([compName]) => ctorArgs[compName] !== false)
            .map(([compName, compClass]) => [compName, new compClass(...(ctorArgs[compName] ?? []))]);
        compInstances.forEach(([compName, compInst]) => {
            if (Util.outOfRange(minPriority, maxPriority, compInst.priority)) {
                throw new ClientError(`Invalid priority ${compInst.priority} for component ${compName}`);
            } else {
                compInst.priority ??= minPriority;
            }
        });

        const compList = compInstances.map(([_, compInst]) => compInst).sort((a, b) => b.priority - a.priority);

        this[pluralName] = Object.fromEntries(compInstances);
        this[listName] = compList;

        compInfo = {
            pluralName,
            listName,
            loaded: false
        };

        this.components.set(name, compInfo);

        const compLoading = compName => {
            if (showLogMessages && showLoadingMessages) {
                this.logger.info(`Loading ${name}: ${compName}...`);
            }
        };

        const compLoaded = (compName, compInst) => {
            if (showLogMessages) {
                this.logger.info(`Loaded ${name}: ${compName}`);
            }

            this[compName] = compInst;
        };

        const loadFinished = _ => {
            const postLoad = options.postLoad;

            if (typeof postLoad === "function") {
                postLoad();
            }

            compInfo.loaded = true;

            if (showLogMessages) {
                this.logger.info(`Loaded ${pluralName}.`);
            }
        };

        if (showLoadingMessages) {
            this.logger.info(`Loading ${pluralName}...`);
        }

        const res = Util.maybeAsyncForEach(compInstances, ([compName, compInst]) => {
            compLoading(compName);
            const compRes = compInst.load();

            if (isPromise(compRes)) {
                return (async _ => {
                    await compRes;
                    compLoaded(compName, compInst);
                })();
            }

            compLoaded(compName, compInst);
        });

        if (isPromise(res)) {
            return (async _ => {
                await res;
                loadFinished();
            })();
        }

        loadFinished();
    }

    unloadComponent(name, options = {}) {
        const compInfo = this.components.get(name);

        if (typeof compInfo === "undefined" || !compInfo.loaded) {
            throw new ClientError(`"${name}" component isn't loaded`);
        }

        const pluralName = compInfo.pluralName,
            listName = compInfo.listName;

        const showLogMessages = options.showLogMessages ?? true,
            showUnloadingMessages = options.showUnloadingMessages ?? true;

        const compUnloading = compName => {
            if (showLogMessages && showUnloadingMessages) {
                this.logger.info(`Unloading ${name}: ${compName}`);
            }
        };

        const compUnloaded = compName => {
            if (showLogMessages) {
                this.logger.info(`Unloaded ${name}: ${compName}`);
            }

            delete this[compName];
        };

        const unloadFinished = _ => {
            Util.wipeArray(this[listName]);

            delete this[pluralName];
            delete this[listName];

            const postUnload = options.postUnload;

            if (typeof postUnload === "function") {
                postUnload();
            }

            compInfo.loaded = false;

            if (showLogMessages) {
                this.logger.info(`Unloaded ${pluralName}.`);
            }
        };

        if (showLogMessages) {
            this.logger.info(`Unloading ${pluralName}...`);
        }

        const res = Util.wipeObject(this[pluralName], (compName, compInst) => {
            compUnloading(compName);
            const compRes = compInst.unload();

            if (isPromise(compRes)) {
                return (async _ => {
                    await compRes;
                    compUnloaded(compName);
                })();
            }

            compUnloaded(compName);
        });

        if (isPromise(res)) {
            return (async _ => {
                await res;
                unloadFinished();
            })();
        }

        unloadFinished();
    }

    loadHandlers() {
        this.loadComponent(
            "handler",
            Handlers,
            {
                commandHandler: [],
                previewHandler: [this.config.enablePreviews],
                reactionHandler: [this.reactions.enableReacts],
                sedHandler: [this.config.enableSed]
            },
            {
                showLoadingMessages: false
            }
        );

        this.executeAllHandlers = executeAllHandlers.bind(undefined, this);
        this.messageProcessor = new MessageProcessor(this);

        this.logger.info("Loaded MessageProcessor.");
    }

    unloadHandlers() {
        this.unloadComponent("handler", {
            showUnloadingMessages: false
        });

        delete this.executeAllHandlers;
        delete this.messageProcessor;

        this.logger.info("Unloaded MessageProcessor.");
    }

    async loadManagers() {
        await this.loadComponent("manager", Managers, {
            tagManager: [],
            permManager: [this.config.enablePermissions],
            commandManager: [],
            reminderManager: [this.config.enableReminders],
            cliCommandManager: [this.config.enableCliCommands]
        });
    }

    async unloadManagers() {
        await this.unloadComponent("manager");
    }

    loadVMs() {
        const vmArgs = {
            tagVM: [this.config.enableEval],
            tagVM2: [this.config.enableVM2],
            externalVM: false
        };

        if (this.config.enableOtherLangs) {
            vmArgs.externalVM = [];
        }

        this.loadComponent("VM", VMs, vmArgs, {
            showLoadingMessages: false
        });
    }

    unloadVMs() {
        this.unloadComponent("VM", {
            showUnloadingMessages: false
        });
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

    setStopped() {
        this.started = false;
        this.startedAt = -1;
    }

    setStarted() {
        this.started = true;
        this.startedAt = Date.now();
    }

    onKill() {
        this.deleteLogger();
    }
}

function getClient() {
    return client;
}

function getLogger() {
    return client.logger;
}

export { LevertClient, getClient, getLogger };
