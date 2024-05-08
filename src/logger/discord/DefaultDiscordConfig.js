import getFormat from "../getFormat.js";

const discordFormat = [
    "timestamp ",
    {
        name: "errors",
        opts: {
            stack: true
        }
    }
];

function getDefaultDiscordConfig(level) {
    const config = {
        level: level ?? "info",
        format: getFormat(discordFormat)
    };

    return config;
}

export default getDefaultDiscordConfig;
