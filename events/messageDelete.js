import { Events } from "discord.js";

import { getClient } from "../LevertClient.js";

export default {
    name: Events.MessageDelete,
    listener: msg => {
        if (msg.author.bot) {
            return;
        }
        
        getClient().executeAllHandlers("delete", msg);
    }
};