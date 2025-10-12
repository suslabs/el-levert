import Util from "../Util.js";
import TypeTester from "../TypeTester.js";
import ObjectUtil from "../ObjectUtil.js";

import UtilError from "../../errors/UtilError.js";

const VMUtil = {
    resolveObject(path, propertyMap) {
        if (typeof path !== "string") {
            throw new UtilError("Invalid path provided");
        }

        if (typeof propertyMap === "undefined") {
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
                return `[Circular reference${joinedPath.length < 1 ? "" : `: ${joinedPath}`}]`;
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
    _allowedReqConfig: [
        "url",
        "method",
        "headers",
        "params",
        "data",
        "auth",
        "responseType",
        "responseEncoding",
        "proxy",
        "decompress"
    ],
    _jsonRequestRegex: /\.(json|geojson)(?:[?#]|$)/i,
    makeRequestConfig: (data, context) => {
        const reqConfig = {
            signal: context?.abortSignal
        };

        if (TypeTester.isObject(data)) {
            const filtered = ObjectUtil.filterObject(data, key => VMUtil._allowedReqConfig.includes(key)),
                timeout = Number.isFinite(data.timeout) ? data.timeout : Infinity;

            Object.assign(reqConfig, VMUtil._configDefaults, filtered);

            if (typeof context !== "undefined") {
                reqConfig.timeout = Util.clamp(Math.round(timeout), 0, context.timeRemaining);
            }
        } else if (typeof data === "string") {
            Object.assign(reqConfig, VMUtil._configDefaults, {
                url: data,
                timeout: context?.timeRemaining
            });
        } else {
            throw new UtilError("Invalid request data");
        }

        if (typeof reqConfig.responseType !== "string" || Util.empty(reqConfig.responseType)) {
            reqConfig.responseType =
                typeof reqConfig.url === "string" && VMUtil._jsonRequestRegex.test(reqConfig.url) ? "json" : "text";
        }

        return reqConfig;
    },

    getResponseData: (res, reqError, reqConfig) => {
        const ok = res?.status >= 100 && res?.status < 300;

        const resStatus = res?.status ?? 0,
            resStatusText = res?.statusText ?? reqError?.message ?? "Network error";

        const resUrl = res?.request?.res?.responseUrl ?? res?.request?._currentUrl ?? reqConfig?.url,
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

        return resData;
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

        let stackFrames = err.stack.split("\n"),
            msgLine;

        [msgLine, ...stackFrames] = stackFrames;
        stackFrames = stackFrames.map(frame => frame.trim());

        const res = cb(msgLine, stackFrames) ?? true;

        if (Array.isArray(res)) {
            [msgLine, stackFrames] = res;
        } else if (!res) {
            return;
        }

        const formattedFrames = stackFrames.map(frame => VMUtil._spaces + frame),
            newStack = msgLine + "\n" + formattedFrames.join("\n");

        delete err.stack;
        err.stack = newStack;
    },

    _boundary: "(<isolated-vm boundary>)",
    rewriteIVMStackTrace: err => {
        return VMUtil.rewriteStackTrace(err, (msgLine, stackFrames) => {
            const boundaryLine = stackFrames.findIndex(frame => frame.startsWith("at " + VMUtil._boundary));
            return boundaryLine >= 0 ? [msgLine, stackFrames.slice(0, boundaryLine + 1)] : false;
        });
    },

    _repl: "REPL",
    rewriteReplStackTrace: err => {
        return VMUtil.rewriteStackTrace(err, (msgLine, stackFrames) => {
            const replLine = stackFrames.findIndex(frame => frame.startsWith("at " + VMUtil._repl));
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

export default VMUtil;
