import { Events } from "discord.js";

import { getLogger } from "../LevertClient.js";

export default {
    name: Events.Error,
    listener: err => {
        getLogger().error("Discord client error:", err);
    }
};
