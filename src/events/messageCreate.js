import { Events } from "discord.js";

import { getClient } from "../LevertClient.js";

export default {
    name: Events.MessageCreate,
    listener: async msg => {
        if (!getClient().shouldProcess(msg)) {
            return;
        }

        await getClient().executeAllHandlers("execute", msg);
    }
};
