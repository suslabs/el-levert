import Manager from "../Manager.js";
import ModelRouter from "../../ai/ModelRouter.js";
import Providers from "../../ai/providers/index.js";
import AISession from "../../ai/AISession.js";
import AIToolRegistry from "../../ai/AIToolRegistry.js";
import AIPrompt from "../../ai/AIPrompt.js";
import AITriage from "../../ai/AITriage.js";
import WebSearcher from "../../ai/search/WebSearcher.js";
import AISourceRegistry from "../../ai/sources/AISourceRegistry.js";
import Sources from "../../ai/sources/Sources.js";
import PromptLoader from "../../loaders/ai/PromptLoader.js";

import { getConfig, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import RateLimiter from "../../util/misc/RateLimiter.js";
import HTTPUtil from "../../util/vm/HTTPUtil.js";

import AIError from "../../errors/AIError.js";
import ManagerError from "../../errors/ManagerError.js";

class AIManager extends Manager {
    static $name = "aiManager";
    static loadPriority = 4;

    static promptNames = ["system", "triage", "inspectImage"];

    static defaultProvider = "gemini";

    constructor(enabled, keys, sources = Sources) {
        super(enabled);

        this.sourceDefinitions = sources;

        this.keys = Object.fromEntries(
            Object.entries(ObjectUtil.guaranteeObject(keys)).map(([name, value]) => [
                name,
                ArrayUtil.guaranteeArray(value, null, true).filter(Util.nonemptyString)
            ])
        );
    }

    async load() {
        const config = getConfig().ai;

        this.maxSteps = config.maxSteps === -1 ? Infinity : config.maxSteps;
        this.quickMaxSteps = config.quickMaxSteps;
        this.timeLimit = config.timeLimit;
        this.unlimitedTimeForAdmins = config.unlimitedTimeForAdmins;

        this.thinkingLevel = config.thinkingLevel;
        this.toolThinkingLevel = config.toolThinkingLevel ?? config.thinkingLevel;
        this.requestTimeout = config.requestTimeout;
        this.maxToolOutput = config.maxToolOutput;

        this.rateLimiter = new RateLimiter(config.maxRequests, config.rateLimitWindow);

        this.prompts = await this._loadPrompts(config.promptsPath);
        this.http = HTTPUtil.createAxiosClient(
            {
                allowLocalhostRequests: config.allowLocalhostRequests,
                maxDownloadSize: config.maxDownloadSize
            },
            AIError
        );

        this.router = this._createRouter(config);
        this.tools = new AIToolRegistry(this);
        this.prompt = new AIPrompt(this.prompts.system);
        this.triage = new AITriage(this.prompts.triage);
        this.webSearcher = new WebSearcher(this.http, { tavily: this.keys.tavily });

        this.sources = new AISourceRegistry(this.http, config.requestTimeout);
        await this.sources.load(this.sourceDefinitions);
    }

    unload() {
        this.rateLimiter.destroy();
    }

    async ask(question, request, options) {
        const session = new AISession(this, request, options);
        return await session.run(question);
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

        return new ModelRouter(this.http, providers, usable, config);
    }

    async _loadPrompts(promptsPath) {
        const [prompts] = await new PromptLoader(promptsPath, getLogger()).load();

        const missing = AIManager.promptNames.filter(name => !Util.nonemptyString(prompts[name]));

        if (!Util.empty(missing)) {
            throw new ManagerError(`Missing AI prompt files: ${missing.join(", ")}`, missing);
        }

        return prompts;
    }
}

export default AIManager;
