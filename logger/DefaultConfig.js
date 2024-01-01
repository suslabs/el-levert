function printfTemplate(info) {
    let log = `[${info.timestamp}] - ${info.level}: ${info.message}`;

    if(info.stack) {
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

function getDefaultLoggerConfig(filename, name) {
    const config = {
        name,
        filename,
        fileFormat,
        consoleFormat,
        console: true
    };

    return config;
}

export default getDefaultLoggerConfig;