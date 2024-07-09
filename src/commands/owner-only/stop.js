import { getClient } from "../../LevertClient.js";

export default {
    name: "stop",
    ownerOnly: true,
    category: "owner-only",

    handler: async (_, msg) => {
        await msg.reply(":information_source: Stopping client...");

        await getClient().stop(true);
    }
};
