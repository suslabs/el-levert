import Util from "../Util.js";
import TypeTester from "../TypeTester.js";
import ObjectUtil from "../ObjectUtil.js";

import { VMHttpErrorTypes } from "./VMHttpErrorTypes.js";

import UtilError from "../../errors/UtilError.js";

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
    return Object.values(VMHttpErrorTypes).includes(value) ? value : undefined;
}

let VMUtil = {
    resolveObject(path, propertyMap) {
        if (!Util.nonemptyString(path)) {
            throw new UtilError("Can't resolve object, no path provided");
        } else if (!(propertyMap instanceof Map)) {
            throw new UtilError("Can't resolve object, no property map provided");
        }

        return path.split(".").reduce(({ obj }, key) => {
            const next = obj?.[key] ?? propertyMap.get(key);

            if (typeof next === "undefined") {
                throw new UtilError(`Property not found: ${key}`, key);
            }

            return { parent: obj, obj: next };
        }, {});
    },

    removeCircularReferences: obj => {
        const pathMap = new Map();

        const recRemove = (val, path) => {
            if (!TypeTester.isObject(val)) {
                return val;
            }

            const seenPath = pathMap.get(val);

            if (seenPath) {
                const joinedPath = seenPath.join(".");
                return `[Circular reference${Util.empty(joinedPath) ? "" : `: ${joinedPath}`}]`;
            }

            pathMap.set(val, path);
            const newVal = Array.isArray(val) ? [] : {};

            for (const [key, value] of Object.entries(val)) {
                newVal[key] = recRemove(value, path.concat(key));
            }

            pathMap.delete(val);
            return newVal;
        };

        return recRemove(obj, []);
    },

    formatOutput: out => {
        if (out == null) {
            return out;
        } else if (Array.isArray(out)) {
            return out.join(", ");
        }

        switch (typeof out) {
            case "bigint":
            case "boolean":
            case "number":
                return out.toString(10);
            case "string":
                return out;
            case "function":
            case "symbol":
                return null;
            case "object":
                try {
                    return JSON.stringify(out);
                } catch (err) {
                    return null;
                }
        }
    },

    _allowedEmbedProps: [
        "author",
        "color",
        "description",
        "fields",
        "footer",
        "hexColor",
        "image",
        "thumbnail",
        "timestamp",
        "title",
        "url"
    ],
    formatReply: (text, msg) => {
        let out = {};

        if (TypeTester.isObject(text)) {
            msg = text;
        } else {
            out.content = VMUtil.formatOutput(text) ?? "";
        }

        if (msg == null) {
            return out;
        } else if (typeof msg.content !== "undefined") {
            out.content = VMUtil.formatOutput(msg.content);
        }

        if (TypeTester.isObject(msg.embed)) {
            const embed = ObjectUtil.filterObject(msg.embed, key => VMUtil._allowedEmbedProps.includes(key));
            embed.description ??= "";

            out.embeds = [embed];
        }

        if (TypeTester.isObject(msg.file)) {
            out.file = msg.file;
        }

        return out;
    },

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

    indentation: 4,

    rewriteStackTrace: (err, cb) => {
        if (typeof err.stack !== "string") {
            return;
        }

        const lines = err.stack.split("\n");

        let msgLineCount = -1;

        try {
            const errString = String(err);

            if (err.stack.startsWith(errString)) {
                msgLineCount = errString.split("\n").length;
            }
        } catch (e) {}

        if (msgLineCount === -1) {
            const firstFrameIdx = lines.findIndex(line => line.trim().startsWith("at "));
            msgLineCount = firstFrameIdx !== -1 ? firstFrameIdx : 1;
        }

        msgLineCount = Util.clamp(msgLineCount, 1, lines.length);

        let msgLine = lines.slice(0, msgLineCount).join("\n"),
            stackFrames = lines.slice(msgLineCount).map(frame => frame.trim());

        const res = cb(msgLine, stackFrames) ?? true;

        if (Array.isArray(res)) {
            [msgLine, stackFrames] = res;
        } else if (!res) {
            return;
        }

        const formattedFrames = stackFrames.map(frame => VMUtil._spaces + frame),
            newStack = Util.empty(formattedFrames) ? msgLine : msgLine + "\n" + formattedFrames.join("\n");

        try {
            delete err.stack;
            Object.defineProperty(err, "stack", {
                value: newStack,
                configurable: true,
                writable: true,
                enumerable: false
            });
        } catch (err1) {
            try {
                err.stack = newStack;
            } catch (err2) {}
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
            }

            return false;
        });
    },

    _replBoundary: "REPL",
    rewriteReplStackTrace: err => {
        return VMUtil.rewriteStackTrace(err, (msgLine, stackFrames) => {
            const replLine = stackFrames.findIndex(frame => frame.startsWith("at " + VMUtil._replBoundary));
            return replLine >= 0 ? [msgLine, stackFrames.slice(0, replLine + 1)] : false;
        });
    },

    sockWrite: (socket, packetType, obj) => {
        obj.packetType = packetType ?? "unknown";
        socket.write(JSON.stringify(obj) + "\n");
    }
};

{
    VMUtil._spaces = " ".repeat(VMUtil.indentation);
}

VMUtil = Object.freeze(VMUtil);
export default VMUtil;
