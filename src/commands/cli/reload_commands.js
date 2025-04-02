import { getClient } from "../../LevertClient.js";

export default {
    name: "reload_commands",

    handler: async _ => {
        getClient().silenceDiscordTransports(true);

        await getClient().commandManager.reloadCommands();

        getClient().silenceDiscordTransports(false);
        return "Reloaded commands!";
    }
};
