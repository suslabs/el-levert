import axios from "axios";

import Manager from "../Manager.js";
import GeminiClient from "../../ai/GeminiClient.js";
import AISession from "../../ai/AISession.js";
import AIToolRegistry from "../../ai/AIToolRegistry.js";
import AIResponseFinisher from "../../ai/AIResponseFinisher.js";
import WebSearcher from "../../ai/WebSearcher.js";
import KnowledgeBase from "../../ai/knowledge/KnowledgeBase.js";

import { getConfig } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import HTTPUtil from "../../util/vm/HTTPUtil.js";

import ManagerError from "../../errors/ManagerError.js";

class AIManager extends Manager {
    static $name = "aiManager";
    static loadPriority = 4;

    static maxRedirects = 5;

    constructor(enabled, apiKey) {
        super(enabled);

        this.apiKey = apiKey;
    }

    async load() {
        if (!Util.nonemptyString(this.apiKey)) {
            throw new ManagerError(
                'AI is enabled but no Gemini API key was provided. Set "geminiKey" in auth.json or LEVERET_GEMINI_KEY in auth.env'
            );
        }

        const config = getConfig().ai;

        this.maxSteps = config.maxSteps;
        this.timeLimit = config.timeLimit;
        this.requestTimeout = config.requestTimeout;
        this.maxDownloadSize = config.maxDownloadSize;

        this.http = this._createHttp(config);

        this.gemini = new GeminiClient(this.http, this.apiKey, config);
        this.tools = new AIToolRegistry(this, config.maxToolOutput);
        this.finisher = new AIResponseFinisher();
        this.webSearcher = new WebSearcher(this.http);

        this.knowledge = new KnowledgeBase(this.http, config.sources, config.requestTimeout);
        await this.knowledge.load();
    }

    async ask(question, request, options) {
        const session = new AISession(this, request, options);
        return await session.run(question);
    }

    _createHttp(config) {
        return axios.create({
            maxContentLength: config.maxDownloadSize,
            maxRedirects: AIManager.maxRedirects,
            ...(config.allowLocalhostRequests ? {} : HTTPUtil.createSecureAgents())
        });
    }
}

export default AIManager;
