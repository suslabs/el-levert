import { Events } from "discord.js";

import { getClient } from "../LevertClient.js";

export default {
    name: Events.MessageDelete,
    listener: msg => {
        return getClient().processDelete(msg);
    }
};
