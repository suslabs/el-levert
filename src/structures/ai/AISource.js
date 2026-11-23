import BaseStructure from "../BaseStructure.js";
import NomiCodexClient from "../../ai/sources/NomiCodexClient.js";
import Questbook from "../../ai/sources/Questbook.js";

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
        const backend = this._createBackend(http, timeout);

        if (typeof backend.load === "function") {
            await backend.load();
        }

        return backend;
    }

    _createBackend(http, timeout) {
        switch (this.type) {
            case AISourceTypes.recipes:
                return new NomiCodexClient(http, this.options);
            case AISourceTypes.questbook:
                return new Questbook(http, this.options, timeout);
        }
    }
}

export default AISource;
