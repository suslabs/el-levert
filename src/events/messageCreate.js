import { Events } from "discord.js";

import { getClient } from "../LevertClient.js";

export default {
    name: Events.MessageCreate,
    listener: msg => {
        return getClient().processCreate(msg);
    }
};
