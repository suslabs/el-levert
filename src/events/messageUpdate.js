import { getClient } from "../LevertClient.js";

export default {
    name: "messageUpdate",
    listener: async (_, msg) => {
        if (msg.author.bot) {
            return;
        }

        await getClient().executeAllHandlers("resubmit", msg);
    }
};
