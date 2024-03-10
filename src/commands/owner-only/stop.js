import { getClient } from "../../LevertClient.js";

export default {
    name: "stop",
    ownerOnly: true,
    handler: async (_, msg) => {
        msg.reply(":information_source: Stopping client...");

        await getClient().stop(true);
    }
};
