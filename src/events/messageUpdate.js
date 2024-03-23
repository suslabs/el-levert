import { Events } from "discord.js";

import { getClient } from "../LevertClient.js";

export default {
    name: Events.MessageUpdate,
    listener: (_, msg) => {
        return getClient().processEdit(msg);
    }
};
