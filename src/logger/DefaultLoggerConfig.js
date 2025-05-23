import CallstackUtil from "../util/misc/CallstackUtil.js";

const includeCalls = false,
    logCallDepth = 2;

function printfTemplate(info) {
    let callInfo = "";

    if (includeCalls) {
        callInfo = CallstackUtil.getCallInfo({ depth: logCallDepth });
        callInfo = " " + callInfo;
    }

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

function getDefaultLoggerConfig(name, filename, consoleOutput, level) {
    const config = {
        name,
        filename,
        consoleOutput,
        level,
        fileFormat,
        consoleFormat
    };

    return config;
}

export default getDefaultLoggerConfig;
