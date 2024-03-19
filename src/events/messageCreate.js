import { getClient } from "../LevertClient.js";

export default {
    name: "messageCreate",
    listener: async msg => {
        if (msg.author.bot) {
            return;
        }

        await getClient().executeAllHandlers("execute", msg);
    }
};
