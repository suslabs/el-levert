import Manager from "../Manager.js";
import ModelRouter from "../../ai/ModelRouter.js";
import Providers from "../../ai/providers/index.js";
import AISession from "../../ai/AISession.js";
import AIToolRegistry from "../../ai/AIToolRegistry.js";
import AIPrompt from "../../ai/AIPrompt.js";
import AIPromptGuard from "../../ai/AIPromptGuard.js";
import AITriage from "../../ai/AITriage.js";
import WebSearcher from "../../ai/search/WebSearcher.js";
import PageReader from "../../ai/search/PageReader.js";
import { loadStealthBrowser } from "../../ai/browser/index.js";
import AISourceRegistry from "../../ai/sources/AISourceRegistry.js";
import Sources from "../../ai/sources/Sources.js";
import PromptLoader from "../../loaders/ai/PromptLoader.js";

import { getConfig, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import LoggerUtil from "../../util/LoggerUtil.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import RateLimiter from "../../util/misc/RateLimiter.js";
import HTTPUtil from "../../util/vm/HTTPUtil.js";
import AIUtil from "../../util/ai/AIUtil.js";

import AIError from "../../errors/AIError.js";

async function loadBrowser(allowLocalhostRequests) {
    const StealthBrowser = await loadStealthBrowser();

    if (StealthBrowser === null) {
        getLogger().error(
            'Cannot initialize "browser" search backend: optional browser dependencies could not be loaded.'
        );
        return null;
    }

    return new StealthBrowser(allowLocalhostRequests);
}

class AIManager extends Manager {
    static $name = "aiManager";
    static loadPriority = 4;

    static promptNames = ["system", "triage", "inspectImage"];

    static defaultProvider = "gemini";

    static getKeys(auth) {
        auth = ObjectUtil.guaranteeObject(auth);
        const suffix = "Key";

        return Object.fromEntries(
            Object.entries(auth)
                .filter(([name]) => name.endsWith(suffix))
                .map(([name, value]) => [
                    name.slice(0, -suffix.length),
                    ArrayUtil.unique(ArrayUtil.guaranteeArray(value, null, true).filter(Util.nonemptyString))
                ])
        );
    }

    constructor(enabled, keys, sources = Sources) {
        super(enabled);

        this.sourceDefinitions = sources;
        this.keys = ObjectUtil.guaranteeObject(keys);

        this.promptGuard = null;
        this.redactLogText = null;
        this.rateLimiter = null;
        this.router = null;
        this.tools = null;
        this.browser = null;
        this.pageReader = null;
        this.webSearcher = null;
        this.sources = null;
    }

    async load() {
        const config = getConfig().ai;

        this.maxSteps = Util.normalizeLimit(config.maxSteps);
        this.quickMaxSteps = config.quickMaxSteps;
        this.timeLimit = Util.normalizeLimit(config.timeLimit);
        this.unlimitedTimeForAdmins = config.unlimitedTimeForAdmins;

        this.thinkingLevel = config.thinkingLevel;
        this.toolThinkingLevel = config.toolThinkingLevel ?? config.thinkingLevel;
        this.requestTimeout = Util.normalizeLimit(config.requestTimeout);
        this.maxToolOutput = config.maxToolOutput;

        const http = HTTPUtil.createAxiosClient(
            {
                allowLocalhostRequests: config.allowLocalhostRequests,
                maxDownloadSize: config.maxDownloadSize
            },
            AIError
        );

        const providers = this._createProviders(config, http);

        if (Util.empty(providers)) {
            getLogger().error("AI is unavailable because no AI backend could be loaded.");
            this.enabled = false;
            return;
        }

        const usable = this._getUsableModels(config, providers);

        if (Util.empty(usable)) {
            getLogger().error("AI is unavailable because none of the configured AI models have an API key.");
            this.enabled = false;
            return;
        }

        const prompts = await this._loadPrompts(config.promptsPath, config.packName);

        if (prompts === null) {
            this.enabled = false;
            return;
        }

        this.prompts = prompts;
        this.http = http;
        this.rateLimiter = new RateLimiter(config.maxRequests, config.rateLimitWindow);

        this.promptGuard = new AIPromptGuard(Object.values(this.prompts));
        const secrets = Object.values(this.keys).flat();
        this.redactLogText = text =>
            this.promptGuard.contains(text) ? "[redacted private prompt]" : LoggerUtil.redactText(text, secrets);

        this.router = new ModelRouter(this.http, providers, usable, { ...config, redactLogText: this.redactLogText });
        this.prompt = new AIPrompt(`${AIPromptGuard.instruction}\n\n${this.prompts.system}`);
        this.triage = new AITriage(this.prompts.triage);
        this.browser = await loadBrowser(config.allowLocalhostRequests);
        this.pageReader = new PageReader(this.http, this.browser);
        this.webSearcher = new WebSearcher(this.http, this.browser, this.pageReader, this.keys);

        this.sources = new AISourceRegistry(this.http, config.requestTimeout);
        await this.sources.load(this.sourceDefinitions);

        this.tools = new AIToolRegistry();
        await this.tools.load(this);
    }

    async unload() {
        this.rateLimiter?.destroy();
        this.router?.destroy();
        this.webSearcher?.destroy();
        await this.browser?.close();
    }

    async ask(question, request, options) {
        const session = new AISession(request, options);
        return await session.run(question);
    }

    formatLog(value) {
        if (this.promptGuard !== null && this.promptGuard.contains(value)) {
            value = "[redacted private prompt]";
        }

        return LoggerUtil.formatLog(value, undefined, undefined, this.redactLogText);
    }

    _createProviders(config, http) {
        const providers = new Map(),
            providerNames = Object.keys(Providers),
            configuredProviders = new Set(
                config.models.map(id => ModelRouter.parseModel(id, providerNames, AIManager.defaultProvider).provider)
            );

        for (const [name, providerClass] of Object.entries(Providers)) {
            const keys = this.keys[name] ?? [];

            if (!Util.empty(keys)) {
                providers.set(name, new providerClass(http, keys, { endpoint: config.endpoints[name] }));
            } else if (
                configuredProviders.has(name) ||
                (Util.empty(configuredProviders) && name === AIManager.defaultProvider)
            ) {
                getLogger().error(AIUtil.formatMissingKey(`"${name}" AI provider`, `${name}Key`));
            }
        }

        return providers;
    }

    _getUsableModels(config, providers) {
        const models = config.models.map(id =>
                ModelRouter.parseModel(id, Object.keys(Providers), AIManager.defaultProvider)
            ),
            [usable, skipped] = ArrayUtil.split(models, spec => !providers.has(spec.provider));

        if (!Util.empty(skipped)) {
            getLogger().warn(`Skipping AI models without an API key: ${skipped.map(spec => spec.id).join(", ")}`);
        }

        return usable;
    }

    async _loadPrompts(promptsPath, packName) {
        const [prompts] = await new PromptLoader(promptsPath, getLogger(), { variables: { packName } }).load();

        const missing = AIManager.promptNames.filter(name => !Util.nonemptyString(prompts[name]));

        if (!Util.empty(missing)) {
            getLogger().error(`AI is unavailable because prompt files are missing: ${missing.join(", ")}.`);
            return null;
        }

        return prompts;
    }
}

export default AIManager;
