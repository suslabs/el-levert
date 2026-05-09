import { getClient } from "../../LevertClient.js";

class ReloadCommandsCommand {
    static info = {
        name: "reload_commands"
    };

    async handler() {
        getClient().silenceDiscordTransports(true);

        await getClient().commandManager.reloadCommands();

        getClient().silenceDiscordTransports(false);
        return "Reloaded commands!";
    }
}

export default ReloadCommandsCommand;
