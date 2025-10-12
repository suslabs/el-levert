import loadConfig from "../../config/loadConfig.js";

import { getClient, getLogger } from "../../LevertClient.js";

export default {
    name: "restart",
    aliases: ["reload"],

    handler: async _ => {
        await getClient().restart(() => {
            getLogger().info("Reloading configs...");
            return loadConfig(getLogger());
        });

        return "Restarted bot!";
    }
};
