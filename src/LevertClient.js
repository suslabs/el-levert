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

class LevertClient extends DiscordClient {
    static loggerName = "El Levert";

    static minPriority = -999;
    static maxPriority = 999;

    constructor(configs) {
        super();

        if (client) {
            throw new ClientError("The client can only be constructed once");
        } else {
            client = this;
        }

        this.version = version;
        this.setConfigs(configs);
        this._setStopped();

        this.components = new Map();

        this.logger = null;
        this._setupLogger();
    }

    get uptime() {
        if (!this.started) {
            return 0;
        }

        return Util.timeDelta(this.startedAt, Date.now());
    }

    isBridgeBot(id) {
        if (!this.useBridgeBot || typeof id === "undefined" || id === null) {
            return false;
        }

        return this.config.bridgeBotIds.includes(id);
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

        this.useBridgeBot = !Util.empty(config.bridgeBotIds);
    }

    loadComponent(name, barrel, ctorArgs = {}, options = {}) {
        let compInfo = this.components.get(name) ?? {},
            alreadyLoaded = compInfo?.loaded ?? false;

        if (alreadyLoaded) {
            throw new ClientError(`"${name}" component is already loaded`);
        }

        const showLogMessages = options.showLogMessages ?? true,
            showLoadingMessages = options.showLoadingMessages ?? true;

        let pluralName = options.pluralName,
            listName;

        if (typeof pluralName === "undefined") {
            if (name.endsWith("s")) {
                pluralName = name;
                name = name.slice(0, -1);
            } else {
                pluralName = `${name}s`;
            }
        }

        listName = `${name}List`;

        if (showLogMessages) {
            this.logger.info(`Loading ${pluralName}...`);
        }

        const components = Object.entries(barrel);

        components.forEach(([compName, compClass]) => {
            if (Util.outOfRange(LevertClient.minPriority, LevertClient.maxPriority, compClass.loadPriority)) {
                throw new ClientError(`Invalid load priority ${compClass.loadPriority} for component ${compName}`);
            } else {
                compClass.loadPriority ??= LevertClient.maxPriority;
            }
        });

        components.sort(([, a], [, b]) => a.loadPriority - b.loadPriority);

        const compInstances = components
            .filter(([compName]) => ctorArgs[compName] !== false)
            .map(([compName, compClass]) => {
                const compArgs = ctorArgs[compName] ?? [];

                if (!Array.isArray(compArgs)) {
                    throw new ClientError(`Invalid constructor args for component ${compName}`);
                }

                return [compName, new compClass(...compArgs)];
            });

        compInstances.forEach(([compName, compInst]) => {
            if (Util.outOfRange(LevertClient.minPriority, LevertClient.maxPriority, compInst.priority)) {
                throw new ClientError(`Invalid handler priority ${compInst.priority} for component ${compName}`);
            } else {
                compInst.priority ??= LevertClient.minPriority;
            }
        });

        const compList = compInstances.map(([, compInst]) => compInst).sort((a, b) => b.priority - a.priority);

        this[pluralName] = Object.fromEntries(compInstances);
        this[listName] = compList;

        compInfo = {
            ...compInfo,
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

        const loadFinished = () => {
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
                return (async () => {
                    await compRes;
                    compLoaded(compName, compInst);
                })();
            }

            compLoaded(compName, compInst);
        });

        if (isPromise(res)) {
            return (async () => {
                await res;
                loadFinished();
            })();
        }

        loadFinished();
    }

    unloadComponent(name, options = {}) {
        let compInfo, compLoaded;

        const checkLoaded = () => {
            compInfo = this.components.get(name);
            compLoaded = typeof compInfo !== "undefined" && compInfo.loaded;
        };

        checkLoaded();
        if (!compLoaded) {
            if (name.endsWith("s")) {
                name = name.slice(0, -1);
                checkLoaded();
            }

            if (!compLoaded) {
                throw new ClientError(`"${name}" component isn't loaded`);
            }
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

        const unloadFinished = () => {
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
                return (async () => {
                    await compRes;
                    compUnloaded(compName);
                })();
            }

            compUnloaded(compName);
        });

        if (isPromise(res)) {
            return (async () => {
                await res;
                unloadFinished();
            })();
        }

        unloadFinished();
    }

    async start() {
        if (this.started) {
            throw new ClientError("The bot can only be started once");
        }

        this.logger.info("Starting bot...");

        await this._loadManagers();
        this._loadHandlers();

        await this._loadEvents();

        this._loadVMs();

        await this.login(token, true);

        await this._setActivityFromConfig();
        this.reminderManager.startSendLoop();

        if (this.config.enableGlobalHandler) {
            registerGlobalErrorHandler(this.logger);
        }

        this._setStarted();
        this._addDiscordTransports();

        this.logger.info("Startup complete.");
    }

    async stop(kill = false) {
        if (!this.started) {
            throw new ClientError("The bot can't be stopped if it hasn't been started already");
        }

        this.logger.info("Stopping bot...");
        this._removeDiscordTransports();

        if (this.config.enableGlobalHandler) {
            removeGlobalErrorHandler();
        }

        this._unloadEvents();

        this._unloadHandlers();
        await this._unloadManagers();

        this._unloadVMs();

        this.logout(kill);
        this._setStopped();

        this.logger.info("Bot stopped.");
    }

    async restart(configs) {
        if (!this.started) {
            throw new ClientError("The bot can't be restarted if it hasn't been started already");
        }

        this.logger.info("Restarting bot...");
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

    silenceDiscordTransports(silent = true) {
        const [channelTransport, webhookTransport] = this._getDiscordTransports();

        if (typeof channelTransport !== "undefined") {
            channelTransport.silent = silent;
        }

        if (typeof webhookTransport !== "undefined") {
            webhookTransport.silent = silent;
        }
    }

    _setStarted() {
        this.started = true;
        this.startedAt = Date.now();
    }

    _setStopped() {
        this.started = false;
        this.startedAt = -1;
    }

    _setupLogger() {
        if (this.logger !== null) {
            this._deleteLogger();
        }

        const configOpts = [LevertClient.loggerName, true, true, this.config.logFile, this.config.logLevel],
            config = getDefaultLoggerConfig(...configOpts);

        this.logger = createLogger(config);
        this._wrapEvent = wrapEvent.bind(undefined, this.logger);
    }

    _deleteLogger() {
        if (this.logger === null) {
            return;
        }

        this.logger.end();
        this.logger = null;

        delete this._wrapEvent;
    }

    _loadHandlers() {
        this.loadComponent(
            "handlers",
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

        this._executeAllHandlers = executeAllHandlers.bind(undefined, this);
        this.messageProcessor = new MessageProcessor(this);

        this.logger.info("Loaded MessageProcessor.");
    }

    _unloadHandlers() {
        this.unloadComponent("handlers", {
            showUnloadingMessages: false
        });

        delete this._executeAllHandlers;
        delete this.messageProcessor;

        this.logger.info("Unloaded MessageProcessor.");
    }

    async _loadManagers() {
        await this.loadComponent("managers", Managers, {
            tagManager: [],
            permManager: [this.config.enablePermissions],
            commandManager: [],
            reminderManager: [this.config.enableReminders],
            cliCommandManager: [this.config.enableCliCommands]
        });
    }

    async _unloadManagers() {
        await this.unloadComponent("managers");
    }

    _loadVMs() {
        const vmArgs = {
            tagVM: [this.config.enableEval],
            tagVM2: [this.config.enableVM2],
            externalVM: false
        };

        if (this.config.enableOtherLangs) {
            vmArgs.externalVM = [];
        }

        this.loadComponent("VMs", VMs, vmArgs, {
            showLoadingMessages: false
        });
    }

    _unloadVMs() {
        this.unloadComponent("VMs", {
            showUnloadingMessages: false
        });
    }

    _addDiscordTransports() {
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

    _getDiscordTransports() {
        const channelTransport = this.logger.transports.find(x => x.name === ChannelTransport.$name),
            webhookTransport = this.logger.transports.find(x => x.name === WebhookTransport.$name);

        return [channelTransport, webhookTransport];
    }

    _removeDiscordTransports() {
        const [channelTransport, webhookTransport] = this._getDiscordTransports();

        if (typeof channelTransport !== "undefined") {
            this.logger.remove(channelTransport);
        }

        if (typeof webhookTransport !== "undefined") {
            this.logger.remove(webhookTransport);
        }
    }

    async _setActivityFromConfig() {
        if (!this.config.setActivity) {
            return;
        }

        try {
            await this.setActivity(this.config.activity);
        } catch (err) {
            this.logger.error("Error occured while setting activity:", err);
        }
    }

    _onKill() {
        this._deleteLogger();
    }
}

function getClient() {
    return client;
}

function getLogger() {
    return client.logger;
}

export { LevertClient, getClient, getLogger };
