import { loadBotConfig } from "../../config/loadConfig.js";

import { getClient, getLogger } from "../../LevertClient.js";

class RestartCommand {
    static info = {
        name: "restart",
        arguments: [],
        response: [
            {
                name: "success",
                type: "boolean"
            },
            {
                name: "message",
                type: "string"
            }
        ]
    };

    handler() {
        setTimeout(async () => {
            await getClient().restart(() => {
                getLogger().info("Reloading configs...");
                return loadBotConfig(getLogger());
            });
        }, 500);

        return {
            success: true,
            message: "Restarting bot..."
        };
    }
}

export default RestartCommand;
