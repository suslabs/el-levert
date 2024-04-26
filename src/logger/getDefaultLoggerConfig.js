function printfTemplate(info) {
    let log = `[${info.timestamp}] - ${info.service} - ${info.level}: ${info.message}`;

    if (info.stack) {
        log += `\n${info.stack}`;
    }

    return log;
}

const fileFormat = [
    "json",
    {
        name: "timestamp",
        prop: {
            format: "YYYY-MM-DD HH:mm:ss"
        }
    },
    {
        name: "errors",
        prop: {
            stack: true
        }
    }
];

const consoleFormat = [
    "colorize",
    {
        name: "timestamp",
        prop: {
            format: "YYYY-MM-DD HH:mm:ss"
        }
    },
    {
        name: "errors",
        prop: {
            stack: true
        }
    },
    {
        name: "printf",
        prop: printfTemplate
    }
];

function getDefaultLoggerConfig(name, fileOutput, consoleOutput, filename) {
    const config = {
        name,
        fileOutput,
        consoleOutput,
        filename,
        fileFormat,
        consoleFormat
    };

    return config;
}

export default getDefaultLoggerConfig;
