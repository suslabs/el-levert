import { Events } from "discord.js";

import { getClient } from "../LevertClient.js";

export default {
    name: Events.MessageDelete,
    listener: async msg => {
        if (!msg.guild || msg.author.bot) {
            return;
        }
        
        const promises = getClient().handlerList.map(x => x.delete(msg));
        await promises.reduce((a, b) => a.then(b), Promise.resolve());
    }
};