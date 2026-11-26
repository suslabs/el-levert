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
import ModuleUtil from "../../util/misc/ModuleUtil.js";

import AIError from "../../errors/AIError.js";
import ManagerError from "../../errors/ManagerError.js";

async function loadBrowser(allowLocalhostRequests) {
    const StealthBrowser = await ModuleUtil.loadOptionalModule(
        ["puppeteer", "puppeteer-extra", "puppeteer-extra-plugin-stealth"],
        import.meta.url,
        "../../ai/browser/StealthBrowser.js"
    );

    return StealthBrowser === null ? null : new StealthBrowser(allowLocalhostRequests);
}

class AIManager extends Manager {
    static $name = "aiManager";
    static loadPriority = 4;

    static promptNames = ["system", "triage", "inspectImage"];

    static defaultProvider = "gemini";

    static getKeys(auth) {
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

        this.rateLimiter = new RateLimiter(config.maxRequests, config.rateLimitWindow);

        this.prompts = await this._loadPrompts(config.promptsPath, config.packName);
        this.http = HTTPUtil.createAxiosClient(
            {
                allowLocalhostRequests: config.allowLocalhostRequests,
                maxDownloadSize: config.maxDownloadSize
            },
            AIError
        );

        this.promptGuard = new AIPromptGuard(Object.values(this.prompts));
        const secrets = Object.values(this.keys).flat();
        this.redactLogText = text =>
            this.promptGuard.contains(text) ? "[redacted private prompt]" : LoggerUtil.redactText(text, secrets);

        this.router = this._createRouter(config);
        this.tools = new AIToolRegistry();
        this.prompt = new AIPrompt(`${AIPromptGuard.instruction}\n\n${this.prompts.system}`);
        this.triage = new AITriage(this.prompts.triage);
        this.browser = await loadBrowser(config.allowLocalhostRequests);
        this.pageReader = new PageReader(this.http, this.browser);
        this.webSearcher = new WebSearcher(this.http, this.browser, this.pageReader, this.keys);

        this.sources = new AISourceRegistry(this.http, config.requestTimeout);
        await this.sources.load(this.sourceDefinitions);
    }

    async unload() {
        this.rateLimiter.destroy();
        this.router?.destroy();
        await this.browser?.close();
    }

    async ask(question, request, options) {
        const session = new AISession(request, options);
        return await session.run(question);
    }

    formatLog(value) {
        if (this.promptGuard.contains(value)) {
            value = "[redacted private prompt]";
        }

        return LoggerUtil.formatLog(value, undefined, undefined, this.redactLogText);
    }

    _createProviders(config) {
        const providers = new Map();

        for (const [name, providerClass] of Object.entries(Providers)) {
            const keys = this.keys[name] ?? [];

            if (!Util.empty(keys)) {
                providers.set(name, new providerClass(this.http, keys, { endpoint: config.endpoints[name] }));
            }
        }

        if (Util.empty(providers)) {
            throw new ManagerError(
                'AI is enabled but no API key was provided. Set "geminiKey" or "openrouterKey" in auth.json (or LEVERET_GEMINI_KEY / LEVERET_OPENROUTER_KEY in auth.env)'
            );
        }

        return providers;
    }

    _createRouter(config) {
        const providers = this._createProviders(config);

        const models = config.models.map(id =>
                ModelRouter.parseModel(id, Object.keys(Providers), AIManager.defaultProvider)
            ),
            [usable, skipped] = ArrayUtil.split(models, spec => !providers.has(spec.provider));

        if (!Util.empty(skipped)) {
            getLogger().warn(`Skipping AI models without an API key: ${skipped.map(spec => spec.id).join(", ")}`);
        }

        if (Util.empty(usable)) {
            throw new ManagerError("None of the configured AI models have an API key");
        }

        return new ModelRouter(this.http, providers, usable, { ...config, redactLogText: this.redactLogText });
    }

    async _loadPrompts(promptsPath, packName) {
        const [prompts] = await new PromptLoader(promptsPath, getLogger(), { variables: { packName } }).load();

        const missing = AIManager.promptNames.filter(name => !Util.nonemptyString(prompts[name]));

        if (!Util.empty(missing)) {
            throw new ManagerError(`Missing AI prompt files: ${missing.join(", ")}`, missing);
        }

        return prompts;
    }
}

export default AIManager;
