import { Events } from "discord.js";

import { getClient, getLogger } from "../LevertClient.js";

export default {
    name: Events.ClientReady,
    once: true,
    listener: _ => {
        getLogger().info("Logged in as " + getClient().user.tag);
    }
};