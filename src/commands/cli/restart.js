import { getClient, getLogger } from "../../LevertClient.js";

import loadConfig from "../../config/loadConfig.js";

function configReloader() {
    getLogger().info("Reloading configs...");
    return loadConfig(getLogger());
}

export default {
    name: "restart",
    aliases: ["reload"],

    handler: async _ => {
        await getClient().restart(configReloader);
        return "Restarted bot!";
    }
};
