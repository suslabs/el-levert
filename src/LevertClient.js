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
import TypeTester from "./util/TypeTester.js";
import ArrayUtil from "./util/ArrayUtil.js";
import ObjectUtil from "./util/ObjectUtil.js";
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
        return this.started ? Util.timeDelta(this.startedAt, Date.now()) : 0;
    }

    isBridgeBot(id) {
        if (TypeTester.isObject(id)) {
            id = id.id;
        }

        if (!this.useBridgeBot || id == null) {
            return false;
        } else {
            return this.config.bridgeBotIds.includes(id);
        }
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

    loadComponents(groupName, barrel, ctorArgs = {}, options = {}) {
        const showLogMessages = options.showLogMessages ?? true,
            showLoadingMessages = options.showLoadingMessages ?? true;

        let collectionName, orderedName;
        ({ groupName, collectionName, orderedName } = this._getCompsName(groupName, options));

        const groupInfo = this.components.get(groupName) ?? {};

        if (groupInfo.loaded) {
            throw new ClientError(`"${groupName}" component group is already loaded`, { groupName });
        }

        if (showLogMessages) {
            this.logger.info(`Initializing "${groupName}" components...`);
        }

        const components = Object.entries(barrel);

        for (const [compName, compClass] of components) {
            const compLoadPriority = compClass.loadPriority;

            if (TypeTester.outOfRange(LevertClient.minPriority, LevertClient.maxPriority, compLoadPriority)) {
                throw new ClientError(`Invalid load priority ${compLoadPriority} for component "${compName}"`, {
                    compName,
                    compLoadPriority
                });
            } else {
                compClass.loadPriority ??= LevertClient.maxPriority;
            }
        }

        components.sort(([, a], [, b]) => a.loadPriority - b.loadPriority);

        for (const [compName, args] of Object.entries(ctorArgs)) {
            const finalArgs = {
                enabled: true,
                args: []
            };

            if (typeof args === "boolean") {
                finalArgs.enabled = args;
            } else if (Array.isArray(args)) {
                finalArgs.args = args;
            } else if (TypeTester.isObject(args)) {
                Object.assign(finalArgs, args);
            } else {
                throw new ClientError("Invalid constructor args", args);
            }

            ctorArgs[compName] = finalArgs;
        }

        const enabledComps = components.filter(([compName]) => ctorArgs[compName].enabled),
            compInstances = enabledComps.map(([compName, compClass]) => {
                const compArgs = ctorArgs[compName].args;

                if (!Array.isArray(compArgs)) {
                    throw new ClientError(`Invalid constructor args for component "${compName}"`, { compName });
                }

                return [compName, new compClass(...compArgs)];
            });

        for (const [compName, compInst] of compInstances) {
            const compPriority = compInst.priority;

            if (TypeTester.outOfRange(LevertClient.minPriority, LevertClient.maxPriority, compPriority)) {
                throw new ClientError(`Invalid handler priority ${compPriority} for component "${compName}"`, {
                    compName,
                    compPriority
                });
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

        Object.assign(groupInfo, {
            collectionName,
            orderedName,
            loaded: false
        });

        this.components.set(groupName, groupInfo);

        this[collectionName] = Object.fromEntries(compInstances);
        this[orderedName] = compList;

        const loadingStarted = () => {
            if (showLoadingMessages) {
                this.logger.info(`Loading ${collectionName}...`);
            }
        };

        const loadingFinished = () => {
            const postLoad = options.postLoad;

            if (typeof postLoad === "function") {
                postLoad();
            }

            if (showLogMessages) {
                this.logger.info(`Loaded ${collectionName}.`);
            }

            groupInfo.loaded = true;
            return groupInfo;
        };

        const compLoading = compName => {
            if (showLogMessages && showLoadingMessages) {
                this.logger.info(`Loading ${groupName}: ${compName}...`);
            }
        };

        const compLoaded = (compName, compInst) => {
            if (showLogMessages) {
                this.logger.info(`Loaded ${groupName}: ${compName}`);
            }

            this[compName] = compInst;
        };

        loadingStarted();

        const res = ArrayUtil.maybeAsyncForEach(compInstances, ([compName, compInst]) => {
            compLoading(compName);
            return Util.maybeAsyncThen(compInst.load(), _ => compLoaded(compName, compInst));
        });

        return Util.maybeAsyncThen(res, _ => loadingFinished());
    }

    unloadComponents(groupName, options = {}) {
        const showLogMessages = options.showLogMessages ?? true,
            showUnloadingMessages = options.showUnloadingMessages ?? true;

        let groupInfo;
        ({ info: groupInfo, groupName } = this._getCompsInfo(groupName));

        const unloadingStarted = () => {
            if (showLogMessages) {
                this.logger.info(`Unloading ${groupInfo.collectionName}...`);
            }
        };

        const unloadingFinished = () => {
            ArrayUtil.wipeArray(this[groupInfo.orderedName]);

            delete this[groupInfo.collectionName];
            delete this[groupInfo.orderedName];

            const postUnload = options.postUnload;

            if (typeof postUnload === "function") {
                postUnload();
            }

            if (showLogMessages) {
                this.logger.info(`Unloaded ${groupInfo.collectionName}.`);
            }

            this.components.delete(groupName);

            groupInfo.loaded = false;
            return groupInfo;
        };

        const compUnloading = compName => {
            if (showLogMessages && showUnloadingMessages) {
                this.logger.info(`Unloading ${groupName}: ${compName}`);
            }
        };

        const compUnloaded = compName => {
            if (showLogMessages) {
                this.logger.info(`Unloaded ${groupName}: ${compName}`);
            }

            delete this[compName];
        };

        unloadingStarted();

        const res = ObjectUtil.wipeObject(this[groupInfo.collectionName], (compName, compInst) => {
            compUnloading(compName);
            return Util.maybeAsyncThen(compInst.unload(), _ => compUnloaded(compName, compInst));
        });

        return Util.maybeAsyncThen(res, _ => unloadingFinished());
    }

    checkComponent(groupName, compName, options = {}) {
        const throwErrors = options.throwErrors ?? true,
            msgName = options.altName ?? compName;

        let msg, ref;

        let groupInfo, groupLoaded;
        ({ info: groupInfo, loaded: groupLoaded, groupName } = this._getCompsInfo(groupName));
        let component;

        if (groupLoaded) {
            const collection = this[groupInfo.collectionName];
            component = collection[compName];
        } else {
            msg = `"${groupName}" component group isn't loaded`;
        }

        if (typeof component === "undefined") {
            msg = `${msgName} isn't initialized`;
        } else if (!component.enabled) {
            msg = `${msgName} isn't enabled`;
        }

        if (throwErrors) {
            return typeof msg === "undefined"
                ? component
                : (() => {
                      throw new ClientError(msg, ref);
                  })();
        } else {
            return msg ?? false;
        }
    }

    async start() {
        this.__t1__1 = performance.now();

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

        const time = this._logStartedTime();
        this._setupInputManager();

        return time;
    }

    async stop(kill = false) {
        this.__t1__1 = performance.now();

        if (!this.started) {
            throw new ClientError("The bot can't be stopped if it hasn't been started once");
        }

        this._disableInputManager();

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

        return this._logStoppedTime();
    }

    async restart(configs) {
        this.__t1__2 = performance.now();

        if (!this.started) {
            throw new ClientError("The bot can't be restarted if it hasn't been started once");
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

        if (this.config.enableCliCommands) {
            return this._getBenchmarkTime("__t1__2");
        } else {
            return this._logRestartedTime();
        }
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

    _setupLogger() {
        this._deleteLogger();

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

    _getCompsName(groupName, options = {}) {
        let collectionName = options.pluralName;

        if (typeof collectionName === "undefined") {
            if (groupName.endsWith("s")) {
                collectionName = groupName;
                groupName = Util.before(groupName, -1);
            } else {
                collectionName = `${groupName}s`;
            }
        }

        return {
            groupName,
            collectionName,
            orderedName: `${groupName}List`
        };
    }

    _getCompsInfo(groupName, errorIfNotFound = true) {
        let info, loaded;

        const checkLoaded = () => {
            info = this.components.get(groupName);
            loaded = info?.loaded ?? false;
            return loaded;
        };

        if (!checkLoaded() && groupName.endsWith("s")) {
            groupName = Util.before(groupName, -1);
            checkLoaded();
        }

        if (loaded) {
            return { info, loaded, groupName };
        } else if (errorIfNotFound) {
            throw new ClientError(`"${groupName}" component group isn't loaded`, { groupName });
        }
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

        const individual = TypeTester.isObject(messageFormats) && !Array.isArray(messageFormats);
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
        this.loadComponents(
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
        this.unloadComponents("handlers", {
            showUnloadingMessages: false
        });

        this._unloadMessageProcessor();
    }

    async _loadManagers() {
        await this.loadComponents("managers", Managers, {
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
        await this.unloadComponents("managers");
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

        this.loadComponents("VMs", VMs, vmArgs, {
            showLoadingMessages: false
        });
    }

    _unloadVMs() {
        this.unloadComponents("VMs", {
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

        ArrayUtil.removeItem(this.handlerList, this.cliCommandHandler);

        this.inputManager.handleInput = this.cliCommandHandler.execute;
        this.inputManager.active = true;
    }

    _disableInputManager() {
        if (!this.config.enableCliCommands) {
            return;
        }

        this.inputManager.active = false;
    }

    _getBenchmarkTime(startName) {
        const t2 = performance.now(),
            elapsed = Util.timeDelta(t2, this[startName]);

        delete this[startName];
        return elapsed;
    }

    _logStartedTime() {
        const time = this._getBenchmarkTime("__t1__1");
        this.logger.info(`Startup complete in ${Util.formatNumber(time)} ms.`);
        return time;
    }

    _logStoppedTime() {
        const time = this._getBenchmarkTime("__t1__1");
        this.logger.info(`Bot stopped in ${Util.formatNumber(time)} ms.`);
        return time;
    }

    _logRestartedTime() {
        const time = this._getBenchmarkTime("__t1__2");
        this.logger.info(`Bot restarted in ${Util.formatNumber(time)} ms.`);
        return time;
    }

    onKill() {
        this._logStoppedTime();
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
