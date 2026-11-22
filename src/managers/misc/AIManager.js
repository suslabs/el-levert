import Manager from "../Manager.js";
import GeminiClient from "../../ai/GeminiClient.js";
import AISession from "../../ai/AISession.js";
import AIToolRegistry from "../../ai/AIToolRegistry.js";
import AIPrompt from "../../ai/AIPrompt.js";
import AIResponseFinisher from "../../ai/AIResponseFinisher.js";
import WebSearcher from "../../ai/WebSearcher.js";
import NomiCodexClient from "../../ai/recipes/NomiCodexClient.js";
import KnowledgeBase from "../../ai/knowledge/KnowledgeBase.js";
import PromptLoader from "../../loaders/ai/PromptLoader.js";

import { getConfig, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import RateLimiter from "../../util/misc/RateLimiter.js";
import HTTPUtil from "../../util/vm/HTTPUtil.js";

import AIError from "../../errors/AIError.js";
import ManagerError from "../../errors/ManagerError.js";

class AIManager extends Manager {
    static $name = "aiManager";
    static loadPriority = 4;

    static promptNames = ["system", "finisher", "inspectImage"];

    constructor(enabled, apiKeys) {
        super(enabled);

        this.apiKeys = ArrayUtil.guaranteeArray(apiKeys, null, true).filter(Util.nonemptyString);
    }

    async load() {
        if (Util.empty(this.apiKeys)) {
            throw new ManagerError(
                'AI is enabled but no Gemini API key was provided. Set "geminiKey" in auth.json or LEVERET_GEMINI_KEY in auth.env'
            );
        }

        const config = getConfig().ai;

        this.maxSteps = config.maxSteps === -1 ? Infinity : config.maxSteps;
        this.timeLimit = config.timeLimit;
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

        this.gemini = new GeminiClient(this.http, this.apiKeys, config);
        this.tools = new AIToolRegistry(this);
        this.prompt = new AIPrompt(this.prompts.system);
        this.finisher = new AIResponseFinisher(this.prompts.finisher);
        this.webSearcher = new WebSearcher(this.http);
        this.recipes = config.recipes.enabled ? new NomiCodexClient(this.http, config.recipes) : null;

        this.knowledge = new KnowledgeBase(this.http, config.sources, config.requestTimeout);
        await this.knowledge.load();
    }

    unload() {
        this.rateLimiter.destroy();
    }

    async ask(question, request, options) {
        const session = new AISession(this, request, options);
        return await session.run(question);
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
