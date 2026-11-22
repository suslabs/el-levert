import ivm from "isolated-vm";
const { ExternalCopy } = ivm;

import { getLogger } from "../../../LevertClient.js";

import TypeTester from "../../../util/TypeTester.js";
import ObjectUtil from "../../../util/ObjectUtil.js";
import VMUtil from "../../../util/vm/VMUtil.js";
import HTTPUtil from "../../../util/vm/HTTPUtil.js";

import RateLimiter from "../../../util/misc/RateLimiter.js";

import VMError from "../../../errors/VMError.js";

let fakeAxios = null,
    rateLimiter = null;

function initFakeAxios(options) {
    if (fakeAxios === null) {
        options = ObjectUtil.guaranteeObject(options);

        fakeAxios = HTTPUtil.createAxiosClient(options, VMError);
        rateLimiter = new RateLimiter(options.maxRequests ?? Infinity, options.rateLimitWindow ?? 1000);
    }

    return fakeAxios;
}

function resetFakeAxios() {
    fakeAxios = null;
    rateLimiter?.destroy();
    rateLimiter = null;
}

const FakeHTTP = Object.freeze({
    get client() {
        return fakeAxios;
    },

    get rateLimiter() {
        return rateLimiter;
    },

    resetContext: context => {
        if (context != null && rateLimiter !== null) {
            const root = context.rootContext ?? context;
            rateLimiter.reset(root);
        }
    },

    request: async (context, data) => {
        if (fakeAxios === null) {
            throw new VMError("HTTP client is not initialized");
        }

        const rootContext = context?.rootContext ?? context;

        if (rateLimiter !== null && !rateLimiter.check(rootContext)) {
            throw new VMError("HTTP request rate limit exceeded");
        }

        const reqConfig = VMUtil.makeRequestConfig(data, context);

        let res = null,
            reqErr = null;

        try {
            res = await fakeAxios.request(reqConfig);
        } catch (err) {
            if (err instanceof VMError) {
                throw err;
            }

            reqErr = err;

            if (TypeTester.className(err) === "AxiosError" || err.response != null) {
                getLogger().error("Axios request error:", err);
                res = err.response;
            } else {
                getLogger().error("Script request error:", err);
            }
        }

        const resData = VMUtil.getResponseData(res, reqErr, reqConfig);
        return new ExternalCopy(resData).copyInto();
    }
});

export { FakeHTTP, initFakeAxios, resetFakeAxios };
