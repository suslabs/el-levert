import { getClient } from "../../LevertClient.js";

export default {
    name: "help",

    handler: _ => {
        const help = getClient().cliCommandManager.getHelp();
        return `Available commands are:\n${help}`;
    }
};
