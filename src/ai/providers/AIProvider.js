import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import { httpStatusCodes } from "../../util/misc/HttpStatusCodes.js";
import HTTPUtil from "../../util/vm/HTTPUtil.js";

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

    getQuotaKeys(model, keyIdx) {
        return [`${this.name}#${keyIdx}`, `${this.name}:${model}#${keyIdx}`];
    }

    getQuotaKey(res, model, keyIdx) {
        if (res?.status === httpStatusCodes.PAYMENT_REQUIRED) {
            return `${this.name}#${keyIdx}`;
        }

        return `${this.name}:${model}#${keyIdx}`;
    }

    getErrorMessage(res) {
        return String(res?.data?.error?.message ?? res?.statusText ?? "");
    }

    getUnblockDelay(res) {
        return HTTPUtil.parseRetryAfter(res?.headers?.["retry-after"]);
    }

    isThinkingError() {
        return false;
    }
}

export default AIProvider;
