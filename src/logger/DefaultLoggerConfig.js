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
