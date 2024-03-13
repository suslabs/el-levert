import { Events } from "discord.js";

import { getClient } from "../LevertClient.js";

export default {
    name: Events.MessageDelete,
    listener: async msg => {
        if (msg.author.bot) {
            return;
        }

        await getClient().executeAllHandlers("delete", msg);
    }
};
