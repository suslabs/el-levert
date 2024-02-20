import { Events } from "discord.js";

import { getClient } from "../LevertClient.js";

export default {
    name: Events.MessageCreate,
    listener: msg => {
        if (msg.author.bot) {
            return;
        }

        getClient().executeAllHandlers("execute", msg);
    }
};
