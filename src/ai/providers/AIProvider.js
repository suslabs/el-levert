import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";

import AIError from "../../errors/AIError.js";

class AIProvider {
    constructor(http, keys, options) {
        const compName = this.constructor.$name;

        if (!Util.nonemptyString(compName)) {
            throw new AIError("AI provider must have a name");
        } else if (typeof this.buildRequest !== "function") {
            throw new AIError("Child class must have a buildRequest function");
        } else if (typeof this.parseResponse !== "function") {
            throw new AIError("Child class must have a parseResponse function");
        } else if (typeof this.readStream !== "function") {
            throw new AIError("Child class must have a readStream function");
        }

        options = ObjectUtil.guaranteeObject(options);
        this.options = options;

        this.http = http;
        this.keys = keys;

        this.endpoint = options.endpoint;
    }

    get name() {
        return this.constructor.$name;
    }

    getErrorMessage(res) {
        return String(res.data?.error?.message ?? res.statusText ?? "");
    }

    getUnblockDelay(res) {
        const retryAfter = res.headers?.["retry-after"],
            seconds = Number(retryAfter);

        const delay = Number.isFinite(seconds)
            ? seconds / Util.durationSeconds.milli
            : Date.parse(retryAfter) - Date.now();

        return delay > 0 ? delay : null;
    }

    isThinkingError() {
        return false;
    }
}

export default AIProvider;
