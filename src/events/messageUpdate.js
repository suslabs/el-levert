import { Events } from "discord.js";

import { getClient } from "../LevertClient.js";

export default {
    name: Events.MessageUpdate,
    listener: (oldMsg, newMsg) => {
        return getClient().messageDispatcher.processEdit(oldMsg, newMsg);
    }
};
