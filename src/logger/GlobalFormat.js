import winston from "winston";

const enumerateErrorFormat = winston.format(info => {
    if (info.message instanceof Error) {
        info.message = Object.assign(
            {
                message: info.message.message,
                stack: info.message.stack
            },
            info.message
        );
    }

    if (info instanceof Error) {
        return Object.assign(
            {
                message: info.message,
                stack: info.stack
            },
            info
        );
    }

    return info;
});

const globalFormats = [enumerateErrorFormat];

function getGlobalFormat() {
    const formats = globalFormats.map(format => format());
    return winston.format.combine(...formats);
}

export default getGlobalFormat;
