import { isPromise } from "node:util/types";

import DiscordClient from "./client/DiscordClient.js";

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
import { isObject } from "./util/misc/TypeTester.js";
import ModuleUtil from "./util/misc/ModuleUtil.js";

import ClientError from "./errors/ClientError.js";

let token, client;

class LevertClient extends DiscordClient {
    static loggerName = "El Levert";

    static minPriority = -999;
    static maxPriority = 999;

    constructor(configs) {
        super();

        if (typeof client === "undefined") {
            client = this;
        } else {
            throw new ClientError("The client can only be constructed once");
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
        if (typeof id === "object") {
            id = id?.id;
        }

        if (!this.useBridgeBot || id == null) {
            return false;
        }

        return this.config.bridgeBotIds.includes(id);
    }

    setConfigs(configs) {
        if (configs == null) {
            throw new ClientError("Config cannot be undefined");
        }

        const config = configs.config ?? {},
            reactions = configs.reactions ?? {},
            auth = configs.auth ?? {};

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

        for (const [compName, args] of Object.entries(ctorArgs)) {
            const _args = {
                enabled: true,
                args: []
            };

            if (Array.isArray(args)) {
                _args.args = args;
            } else if (isObject(args)) {
                Object.assign(_args, args);
            } else {
                _args.enabled = args;
            }

            ctorArgs[compName] = _args;
        }

        const enabledComps = components.filter(([compName]) => ctorArgs[compName].enabled),
            compInstances = enabledComps.map(([compName, compClass]) => {
                const compArgs = ctorArgs[compName].args;

                if (!Array.isArray(compArgs)) {
                    throw new ClientError(`Invalid constructor args for component ${compName}`);
                }

                return [compName, new compClass(...compArgs)];
            });

        for (const [compName, compInst] of compInstances) {
            if (Util.outOfRange(LevertClient.minPriority, LevertClient.maxPriority, compInst.priority)) {
                throw new ClientError(`Invalid handler priority ${compInst.priority} for component ${compName}`);
            } else {
                compInst.priority ??= LevertClient.minPriority;
            }
        }

        const compList = compInstances.map(([, compInst]) => compInst).sort((a, b) => b.priority - a.priority);

        for (const compName of Object.keys(ctorArgs)) {
            if (ctorArgs[compName].enabled && typeof barrel[compName] === "undefined") {
                this.logger.warn(
                    `Component "${compName}" specified in constructor args was not found in the available components.`
                );
            }
        }

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
            } else {
                compLoaded(compName, compInst);
            }
        });

        if (isPromise(res)) {
            return (async () => {
                await res;
                loadFinished();
            })();
        } else {
            loadFinished();
        }
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
            } else {
                compUnloaded(compName);
            }
        });

        if (isPromise(res)) {
            return (async () => {
                await res;
                unloadFinished();
            })();
        } else {
            unloadFinished();
        }
    }

    async start() {
        if (this.started) {
            throw new ClientError("The bot can only be started once");
        }

        this.logger.info("Starting bot...");

        this._setOtherConfigs();

        await this._loadManagers();
        this._loadHandlers();

        await this._loadEvents();

        await ModuleUtil.resolveBarrel(VMs);
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

        this._setupInputManager();
    }

    async stop(kill = false) {
        if (!this.started) {
            throw new ClientError("The bot can't be stopped if it hasn't been started already");
        }

        this.inputManager.active = false;

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
        const { channelTransport, webhookTransport } = this._getDiscordTransports();

        if (typeof channelTransport !== "undefined") {
            channelTransport.silent = silent;
        }

        if (typeof webhookTransport !== "undefined") {
            webhookTransport.silent = silent;
        }
    }

    static _formatContentGroup = "(?<content>)";

    _setStarted() {
        this.started = true;
        this.startedAt = Date.now();
    }

    _setStopped() {
        this.started = false;
        this.startedAt = -1;
    }

    _setOtherConfigs() {
        delete this.bridgeBotExp;
        delete this.bridgeBotExps;

        this._setBridgeBotConfig();
    }

    _parseBridgeBotFormat(format) {
        if (typeof format === "string") {
            format = [format];
        } else if (!Array.isArray(format)) {
            return [null, false];
        }

        format = format.filter(exp => !Util.empty(exp) && exp.includes(LevertClient._formatContentGroup));

        if (Util.empty(format)) {
            return [null, false];
        }

        let expStr = `(${format.join(")|(")})`;

        let i = 1;
        expStr = expStr.replaceAll(LevertClient._formatContentGroup, _ => `(?<content${i++}>)`);

        try {
            const exp = new RegExp(expStr);
            return [exp, true];
        } catch (err) {
            return [null, false];
        }
    }

    _setBridgeBotConfig() {
        let botIds = this.config.bridgeBotIds,
            messageFormats = this.config.bridgeBotMessageFormats ?? this.config.bridgeBotMessageFormat;

        let enabled = !Util.empty(botIds);

        if (!enabled) {
            this.useBridgeBot = enabled;
            return;
        }

        const individual = isObject(messageFormats) && !Array.isArray(messageFormats);
        this.individualBridgeBotFormats = individual;

        if (individual) {
            this.bridgeBotExps = new Map();

            for (let i = botIds.length - 1; i >= 0; i--) {
                const id = botIds[i],
                    format = messageFormats[id];

                const [exp, valid] = this._parseBridgeBotFormat(format);

                if (valid) {
                    this.bridgeBotExps.set(id, exp);
                } else {
                    this.logger.warn(`No/invalid regex for bot "${id}".`);
                    botIds.splice(i, 1);
                }
            }

            enabled = !Util.empty(botIds);
        } else {
            const [exp, valid] = this._parseBridgeBotFormat(messageFormats);

            if (valid) {
                this.bridgeBotExp = exp;
            } else {
                this.logger.warn("No/invalid bridge bot regex provided.");
                enabled = false;
            }
        }

        if (!enabled) {
            this.logger.warn("Bridge bot support was disabled.");
        }

        this.useBridgeBot = enabled;
    }

    _setupLogger() {
        if (this.logger !== null) {
            this._deleteLogger();
        }

        const configOpts = [LevertClient.loggerName, this.config.logFile, true, this.config.logLevel],
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

    _loadMessageProcessor() {
        this._executeAllHandlers = executeAllHandlers.bind(undefined, this);
        this.messageProcessor = new MessageProcessor(this);

        this.logger.info("Loaded MessageProcessor.");
    }

    _unloadMessageProcessor() {
        delete this._executeAllHandlers;
        delete this.messageProcessor;

        this.logger.info("Unloaded MessageProcessor.");
    }

    _loadHandlers() {
        this.loadComponent(
            "handlers",
            Handlers,

            {
                commandHandler: [],
                previewHandler: [this.config.enablePreviews],
                reactionHandler: this.reactions.enableReacts,
                sedHandler: this.config.enableSed,
                cliCommandHandler: this.config.enableCliCommands
            },

            {
                showLoadingMessages: false
            }
        );

        this._loadMessageProcessor();
    }

    _unloadHandlers() {
        this.unloadComponent("handlers", {
            showUnloadingMessages: false
        });

        this._unloadMessageProcessor();
    }

    async _loadManagers() {
        await this.loadComponent("managers", Managers, {
            tagManager: [],
            permManager: [this.config.enablePermissions],
            commandManager: [],
            reminderManager: this.config.enableReminders,
            cliCommandManager: this.config.enableCliCommands,
            inputManager: {
                enabled: this.config.enableCliCommands,
                args: [
                    true,
                    ">",
                    {
                        exitCmd: null
                    }
                ]
            }
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

        return { channelTransport, webhookTransport };
    }

    _removeDiscordTransports() {
        const { channelTransport, webhookTransport } = this._getDiscordTransports();

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

    _setupInputManager() {
        if (!this.config.enableCliCommands) {
            return;
        }

        Util.removeItem(this.handlerList, this.cliCommandHandler);

        this.inputManager.handleInput = this.cliCommandHandler.execute;
        this.inputManager.active = true;
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
