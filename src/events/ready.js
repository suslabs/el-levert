import { Events } from "discord.js";

import { getClient } from "../LevertClient.js";

export default {
    name: Events.ClientReady,
    once: true,

    listener: _ => {
        getClient().onReady();
    }
};
