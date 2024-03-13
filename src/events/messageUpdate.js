import { Events } from "discord.js";

import { getClient } from "../LevertClient.js";

export default {
    name: Events.MessageUpdate,
    listener: async (_, msg) => {
        if (msg.author.bot) {
            return;
        }

        await getClient().executeAllHandlers("resubmit", msg);
    }
};
