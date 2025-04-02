import { getClient } from "../../LevertClient.js";

export default {
    name: "help",
    aliases: ["list"],

    handler: _ => {
        const help = getClient().cliCommandManager.getHelp();
        return `Available commands are:\n${help}`;
    }
};
