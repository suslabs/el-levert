import ivm from "isolated-vm";
const { ExternalCopy } = ivm;

import axios from "axios";

import { getLogger } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import TypeTester from "../../../util/TypeTester.js";
import ObjectUtil from "../../../util/ObjectUtil.js";

const configDefaults = {
    maxRedirects: 5,
    validateStatus: () => true
};

const allowedConfig = [
    "url",
    "method",
    "headers",
    "params",
    "data",
    "auth",
    "responseType",
    "responseEncoding",
    "responseEncoding",
    "proxy",
    "decompress"
];

const jsonTypeRegex = /\.(json|geojson)(?:[?#]|$)/i;

const FakeHttp = Object.freeze({
    request: async (context, data) => {
        let reqConfig;

        if (typeof data === "object") {
            const filtered = ObjectUtil.filterObject(data, key => allowedConfig.includes(key));
            reqConfig = Object.assign({}, filtered, configDefaults);

            const timeout = Number.isFinite(data.timeout) ? data.timeout : Infinity;
            reqConfig.timeout = Util.clamp(Math.round(timeout), 0, context.timeRemaining);
        } else {
            reqConfig = {
                url: data,
                timeout: context.timeRemaining,
                ...configDefaults
            };
        }

        if (typeof reqConfig.responseType !== "string" || Util.empty(reqConfig.responseType)) {
            reqConfig.responseType =
                typeof reqConfig.url === "string" && jsonTypeRegex.test(reqConfig.url) ? "json" : "text";
        }

        reqConfig.signal = context.abortSignal;

        let res, reqError;

        try {
            res = await axios.request(reqConfig);
        } catch (err) {
            reqError = err;

            if (TypeTester.className(err) === "AxiosError") {
                getLogger().error("Axios request error:", err);
                res = err.response;
            } else {
                getLogger().error("Script request error:", err);
            }
        }

        const ok = res?.status >= 100 && res?.status < 300;

        const resStatus = res?.status ?? 0,
            resStatusText = res?.statusText ?? reqError?.message ?? "Network error";

        const resUrl = res?.request?.res?.responseUrl ?? res?.request?._currentUrl ?? reqConfig.url,
            resHeaders = ObjectUtil.rewriteObject(
                res?.headers || {},
                key => key.toLowerCase(),
                value => (Array.isArray(value) ? value.join(", ") : String(value))
            );

        const resData = {
            ok,
            status: resStatus,
            statusText: resStatusText,
            url: resUrl,
            headers: resHeaders,
            data: res?.data ?? null
        };

        if (reqError != null) {
            const reqErrMessage = reqError?.message ?? String(reqError);
            resData.error = { message: reqErrMessage };
        }

        return new ExternalCopy(resData).copyInto();
    }
});

export default FakeHttp;
