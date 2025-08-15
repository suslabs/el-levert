import ivm from "isolated-vm";
const { ExternalCopy } = ivm;

import axios from "axios";

import { getLogger } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import ObjectUtil from "../../../util/ObjectUtil.js";

const configDefaults = {
        validateStatus: () => true
    },
    allowedConfig = [
        "url",
        "method",
        "headers",
        "params",
        "data",
        "auth",
        "responseType",
        "responseEncoding",
        "responseEncoding",
        "maxBodyLength",
        "proxy",
        "decompress"
    ];

const jsonTypeRegex = /\.(json|geojson)(?:[?#]|$)/i;

const FakeHttp = Object.freeze({
    request: async (context, data) => {
        let config;

        if (typeof data === "object") {
            const filtered = ObjectUtil.filterObject(config, key => allowedConfig.includes(key));
            config = Object.assign({}, filtered, configDefaults);

            const timeout = isNaN(config.timeout) ? config.timeout : 0;
            config.timeout = Util.clamp(timeout, null, context.timeRemaining);
        } else {
            config = {
                url: data,
                timeout: context.timeRemaining,
                ...configDefaults
            };
        }

        if (typeof config.requestType !== "string" || Util.empty(config.requestType)) {
            if (typeof config.url === "string" && jsonTypeRegex.test(config.url)) {
                config.responseType = "json";
            } else {
                config.responseType = "text";
            }
        }

        let res, reqError;

        try {
            res = await axios.request(config);
        } catch (err) {
            reqError = err;

            if (err.name === "AxiosError") {
                getLogger().error("Axios request error:", err);
                res = err.response;
            } else {
                getLogger().error("Script request error:", err);
            }
        }

        const ok = res?.status >= 100 && res?.status < 300;

        const resStatus = res?.status ?? 0,
            resStatusText = res?.statusText ?? reqError?.message ?? "Network error";

        const resUrl = (res.request && (res.request.res?.responseUrl || res.request._currentUrl)) || config.url,
            resHeaders = ObjectUtil.rewriteObject(
                res.headers || {},
                key => key.toLowerCase(),
                value => (Array.isArray(value) ? value.join(", ") : String(value))
            );

        const resData = {
            ok,
            status: resStatus,
            statusText: resStatusText,
            url: resUrl,
            headers: resHeaders,
            data: res.data
        };

        if (reqError != null) {
            const reqErrMessage = reqError?.message ?? String(reqError);
            resData.error = { message: reqErrMessage };
        }

        return new ExternalCopy(resData).copyInto();
    }
});

export default FakeHttp;
