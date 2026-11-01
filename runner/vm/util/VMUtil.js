import CommonVMUtil from "@el-levert/common/util/VMUtil.js";

import VMHttpErrorTypes from "./VMHttpErrorTypes.js";
import { vmErrorMessages } from "../VMErrors.js";

import Util from "@el-levert/common/util/Util.js";
import TypeTester from "@el-levert/common/util/TypeTester.js";
import ObjectUtil from "@el-levert/common/util/ObjectUtil.js";

import UtilError from "@el-levert/common/errors/UtilError.js";

function normalizeResponseType(value) {
    if (!Util.nonemptyString(value)) {
        return undefined;
    }

    value = value.toLowerCase();
    return VMUtil._allowedResponseTypes.includes(value) ? value : undefined;
}

function normalizeRequestNumber(value, min = 0) {
    if (!Number.isFinite(value)) {
        return undefined;
    }

    return Math.max(Math.round(value), min);
}

function normalizeRequestErrorType(value) {
    return VMHttpErrorTypes.has(value) ? value : undefined;
}

let VMUtil = {
    ...CommonVMUtil,

    _reqConfigDefaults: {
        maxRedirects: 5,
        validateStatus: () => true
    },

    _allowedResponseTypes: ["arraybuffer", "json", "text"],
    _jsonRequestRegex: /\.(json|geojson)(?:[?#]|$)/i,

    _normalizeRequestConfig: data =>
        ObjectUtil.removeUndefinedValues({
            url: Util.nonemptyString(data.url) ? data.url : undefined,
            method: Util.nonemptyString(data.method) ? data.method.toLowerCase() : undefined,
            headers: TypeTester.isObject(data.headers) ? data.headers : undefined,
            params: TypeTester.isObject(data.params) ? data.params : undefined,
            data: data.data ?? undefined,
            auth: TypeTester.isObject(data.auth) ? data.auth : undefined,
            responseType: normalizeResponseType(data.responseType),
            responseEncoding: Util.nonemptyString(data.responseEncoding) ? data.responseEncoding : undefined,
            proxy: TypeTester.isObject(data.proxy) ? data.proxy : undefined,
            decompress: typeof data.decompress === "boolean" ? data.decompress : undefined,
            maxRedirects: normalizeRequestNumber(data.maxRedirects),
            validateStatus: typeof data.validateStatus === "function" ? data.validateStatus : undefined,
            errorType: normalizeRequestErrorType(data.errorType)
        }),

    makeRequestConfig: (data, context) => {
        const errorType = data?.errorType ?? VMHttpErrorTypes.legacy;

        const reqConfig = {
            signal: context?.abortSignal
        };

        if (TypeTester.isObject(data)) {
            const normalized = VMUtil._normalizeRequestConfig(data),
                timeout = Number.isFinite(data.timeout) ? data.timeout : Infinity;

            Object.assign(reqConfig, VMUtil._reqConfigDefaults, normalized);

            if (typeof context !== "undefined") {
                reqConfig.timeout = Util.clamp(Math.round(timeout), 0, context.timeRemaining);
            }
        } else if (typeof data === "string") {
            Object.assign(reqConfig, VMUtil._reqConfigDefaults, {
                url: data,
                timeout: context?.timeRemaining
            });
        } else {
            throw new UtilError("Invalid request data");
        }

        switch (errorType) {
            default:
            case VMHttpErrorTypes.legacy:
                break;
            case VMHttpErrorTypes.value:
                if (!Util.nonemptyString(reqConfig.responseType)) {
                    reqConfig.responseType = VMUtil._jsonRequestRegex.test(reqConfig.url) ? "json" : "text";
                }

                break;
        }

        return reqConfig;
    },

    getResponseData: (res, reqError, reqConfig) => {
        const errorType = reqConfig?.errorType ?? VMHttpErrorTypes.legacy;

        const resStatus = res?.status ?? -1,
            resStatusText = res?.statusText ?? reqError?.message ?? "Network error";

        const resHeaders = ObjectUtil.rewriteObject(
            res?.headers || {},
            key => key.toLowerCase(),
            value => (Array.isArray(value) ? value.join(", ") : String(value))
        );

        const resData = {
            status: resStatus,
            statusText: resStatusText,
            headers: resHeaders,
            data: res?.data ?? null
        };

        switch (errorType) {
            default:
            case VMHttpErrorTypes.legacy:
                if (reqError == null) {
                    return resData;
                } else {
                    // eslint-disable-next-line no-restricted-syntax
                    throw new Error(`Request failed with status code ${resStatus}`);
                }
            case VMHttpErrorTypes.value:
                return {
                    ...resData,
                    ok: res?.status >= 100 && res?.status < 300,
                    url: res?.request?.res?.responseUrl ?? reqConfig?.url ?? null,
                    ...(reqError == null
                        ? {}
                        : {
                              error: {
                                  message: reqError?.message ?? String(reqError)
                              }
                          })
                };
        }
    },

    initialBreakpoint: "/* break on script start */ debugger;",
    strictRegex: /^\s*(['"])use strict\1;?/,

    addDebuggerStmt: code => {
        if (VMUtil.strictRegex.test(code)) {
            return code.replace(VMUtil.strictRegex, match => `${match}\n${VMUtil.initialBreakpoint}\n`);
        } else {
            return `${VMUtil.initialBreakpoint}\n\n${code}`;
        }
    },

    _ivmBoundary: "(<isolated-vm boundary>)",
    _compileScript: "compileScript",

    rewriteIVMStackTrace: err => {
        return VMUtil.rewriteStackTrace(err, (msgLine, stackFrames) => {
            const boundaryLine = stackFrames.findIndex(frame => frame.startsWith("at " + VMUtil._ivmBoundary)),
                hostLine = stackFrames.findIndex(frame => frame.includes(VMUtil._compileScript));

            if (boundaryLine >= 0) {
                return [msgLine, stackFrames.slice(0, boundaryLine + 1)];
            } else if (hostLine >= 0) {
                return [msgLine, stackFrames.slice(0, hostLine)];
            } else if (err?.name === "VMError" || vmErrorMessages.has(err?.message)) {
                return [msgLine, []];
            }

            return false;
        });
    }
};

VMUtil = Object.freeze(VMUtil);
export default VMUtil;
