import { getClient } from "../../LevertClient.js";

export default {
    name: "reload_commands",
    ownerOnly: true,
    category: "owner-only",
    handler: async _ => {
        getClient().silenceDiscordTransports(true);

        await getClient().commandManager.reloadCommands();

        getClient().silenceDiscordTransports(false);
        return ":white_check_mark: Reloaded commands!";
    }
};
