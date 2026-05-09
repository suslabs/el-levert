import { getClient } from "../../LevertClient.js";

class HelpCommand {
    static info = {
        name: "help",
        aliases: ["list"]
    };

    handler() {
        const help = getClient().cliCommandManager.getHelp();
        return `Available commands are:\n${help}`;
    }
}

export default HelpCommand;
