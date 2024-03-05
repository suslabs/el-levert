import { getClient } from "../../LevertClient.js";

export default {
    name: "stop",
    load: function () {
        this.allowed = getClient().permManager.ownerLevel;
    },
    handler: async (args, msg, perm) => {
        msg.reply(":information_source: Stopping client...");

        await getClient().stop(true);
    }
};
