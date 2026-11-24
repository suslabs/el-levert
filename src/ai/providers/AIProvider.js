import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";

import AIError from "../../errors/AIError.js";

class AIProvider {
    static providerName = null;

    constructor(http, keys, options) {
        if (!Util.nonemptyString(this.constructor.providerName)) {
            throw new AIError("AI provider must have a name");
        } else if (typeof this.buildRequest !== "function") {
            throw new AIError("Child class must have a buildRequest function", this.constructor.providerName);
        } else if (typeof this.parseResponse !== "function") {
            throw new AIError("Child class must have a parseResponse function", this.constructor.providerName);
        } else if (typeof this.readStream !== "function") {
            throw new AIError("Child class must have a readStream function", this.constructor.providerName);
        }

        options = ObjectUtil.guaranteeObject(options);

        this.http = http;
        this.keys = keys;

        this.endpoint = options.endpoint;
    }

    get name() {
        return this.constructor.providerName;
    }

    getErrorMessage(res) {
        return String(res.data?.error?.message ?? res.statusText ?? "");
    }

    getErrorReason() {
        return null;
    }

    getUnblockDelay() {
        return null;
    }

    isThinkingError() {
        return false;
    }
}

export default AIProvider;
