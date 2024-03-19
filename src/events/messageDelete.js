import { getClient } from "../LevertClient.js";

export default {
    name: "messageDelete",
    listener: async msg => {
        if (msg.author.bot) {
            return;
        }

        await getClient().executeAllHandlers("delete", msg);
    }
};
