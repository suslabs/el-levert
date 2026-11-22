import { Events } from "discord.js";

import { getClient } from "../LevertClient.js";

export default {
    name: Events.MessageReactionAdd,
    listener: (reaction, user) => {
        return getClient().reactionDispatcher.processAdd(reaction, user);
    }
};
