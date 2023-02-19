import { Events } from "discord.js";

import { getClient } from "../LevertClient.js";

export default {
    name: Events.MessageUpdate,
    listener: (_, msg) => {
        if (msg.author.bot) {
            return;
        }

        getClient().executeAllHandlers("resubmit", msg);
    }
};