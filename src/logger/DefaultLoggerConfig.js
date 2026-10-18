import CallstackUtil from "../util/misc/CallstackUtil.js";

const includeCalls = false,
    logCallDepth = 2;

function printfTemplate(info) {
    let callInfo = "";

    if (includeCalls) {
        callInfo = " " + CallstackUtil.getCallInfo({ depth: logCallDepth });
    }

    let log = `[${info.timestamp}]${callInfo} - ${info.service} - ${info.level}: ${info.message}`;

    if (info.stack) {
        log += `\n${info.stack}`;
    }

    return log;
}

const fileFormat = [
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
    "json"
];

function getDefaultLoggerConfig(name, filename, consoleOutput, level, options = {}) {
    const showDate = options.showDate ?? true,
        dateFormat = showDate ? "YYYY-MM-DD HH:mm:ss" : "HH:mm:ss";

    const config = {
        name,
        filename,
        consoleOutput,
        level,
        fileFormat,
        consoleFormat: [
            "colorize",
            {
                name: "timestamp",
                opts: {
                    format: dateFormat
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
        ]
    };

    return config;
}

export default getDefaultLoggerConfig;
