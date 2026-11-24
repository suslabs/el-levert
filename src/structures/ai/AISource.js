import BaseStructure from "../BaseStructure.js";
import NomiCodexClient from "../../ai/sources/NomiCodexClient.js";
import WikiClient from "../../ai/sources/WikiClient.js";
import DocsLibrary from "../../ai/sources/DocsLibrary.js";

import AISourceTypes from "./AISourceTypes.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";

import AIError from "../../errors/AIError.js";

class AISource extends BaseStructure {
    static defaultValues = {
        name: "",
        type: null,
        options: {}
    };

    constructor(data) {
        super(data);

        if (!Util.nonemptyString(this.name)) {
            throw new AIError("AI source must have a name");
        }

        this.type = TypeTester.normalizeEnum(this.type, AISourceTypes, "source type", AIError);
    }

    async load(http, timeout) {
        const backend = this._createBackend(http);

        if (typeof backend.load === "function") {
            await backend.load(timeout);
        }

        return backend;
    }

    _createBackend(http) {
        switch (this.type) {
            case AISourceTypes.recipes:
                return new NomiCodexClient(http, this.options);
            case AISourceTypes.wiki:
                return new WikiClient(http, this.options);
            case AISourceTypes.docs:
                return new DocsLibrary(http, this.options);
        }
    }
}

export default AISource;
