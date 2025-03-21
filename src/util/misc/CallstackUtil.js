import { pathToFileURL } from "node:url";
import path from "node:path";

import Util from "../Util.js";

import UtilError from "../../errors/UtilError.js";

const CallstackUtil = {
    rootUrl: pathToFileURL(projRoot).toString(),

    getCallstack: () => {
        const oldLimit = Error.stackTraceLimit;
        Error.stackTraceLimit = 1000;

        const oldPrepare = Error.prepareStackTrace;
        Error.prepareStackTrace = (_, stack) => stack;

        const stack = new Error().stack;
        Error.prepareStackTrace = oldPrepare;

        Error.stackTraceLimit = oldLimit;

        if (stack === null || typeof stack !== "object") {
            throw new UtilError("Invalid callstack");
        }

        return Util.after(stack);
    },

    getCallInfo: (options = {}) => {
        const minDepth = options.depth ?? 0,
            excludeFunctions = options.excludeFunctions ?? [];

        let stack;

        try {
            stack = CallstackUtil.getCallstack().slice(minDepth);
        } catch (err) {
            if (err.name === "UtilError") {
                return "no info";
            }

            throw err;
        }

        const site = stack.find(
            site =>
                site.getFileName().startsWith(CallstackUtil.rootUrl) &&
                !excludeFunctions.includes(site.getFunctionName())
        );

        if (typeof site === "undefined") {
            return "no info";
        }

        const siteFile = site.getFileName().slice(CallstackUtil.rootUrl.length + 1),
            siteIndex = `${site.getLineNumber()}:${site.getColumnNumber()}`,
            siteFunction = site.getFunctionName();

        const callInfo = `${siteFile}:${siteIndex} (${siteFunction})`;
        return callInfo;
    }
};

export default CallstackUtil;
