import getCallStack from "../util/getCallStack.js";

import { pathToFileURL } from "node:url";
import path from "node:path";

const includeCalls = false;

const rootUrl = pathToFileURL(projRoot).toString(),
    logCallDepth = 3;

function getCallInfo() {
    let site = "";

    try {
        const stack = getCallStack().slice(logCallDepth);
        site = stack.find(x => x.getFileName().startsWith(rootUrl));
    } catch (err) {
        if (err.message === "Invalid callstack") {
            return "no info";
        } else {
            throw err;
        }
    }

    const siteFile = site.getFileName().slice(rootUrl.length + 1),
        siteIndex = `${site.getLineNumber()}:${site.getColumnNumber()}`,
        siteFunction = site.getFunctionName();

    const callInfo = `${siteFile}:${siteIndex} (${siteFunction})`;
    return callInfo;
}

function printfTemplate(info) {
    const callInfo = includeCalls ? " " + getCallInfo() : "";

    let log = `[${info.timestamp}]${callInfo} - ${info.service} - ${info.level}: ${info.message}`;

    if (info.stack) {
        log += `\n${info.stack}`;
    }

    return log;
}

const fileFormat = [
    "json",
    {
        name: "timestamp",
        opts: {
            format: "YYYY-MM-DD HH:mm:ss"
        }
    },
    {
        name: "errors",
        opts: {
            stack: true
        }
    }
];

const consoleFormat = [
    "colorize",
    {
        name: "timestamp",
        opts: {
            format: "YYYY-MM-DD HH:mm:ss"
        }
    },
    {
        name: "errors",
        opts: {
            stack: true
        }
    },
    {
        name: "printf",
        opts: printfTemplate
    }
];

function getDefaultLoggerConfig(name, fileOutput, consoleOutput, filename, level) {
    const config = {
        name,
        fileOutput,
        consoleOutput,
        filename,
        level,
        fileFormat,
        consoleFormat
    };

    return config;
}

export default getDefaultLoggerConfig;
