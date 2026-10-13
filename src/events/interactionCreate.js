import { Events } from "discord.js";

import { getClient } from "../LevertClient.js";

export default {
    name: Events.InteractionCreate,
    listener: interaction => {
        return getClient().interactionDispatcher.processCreate(interaction);
    }
};
