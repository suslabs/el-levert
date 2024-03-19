import { getClient } from "../LevertClient.js";

export default {
    name: "messageUpdate",
    listener: async (_, msg) => {
        if (!getClient().guilds.includes(msg.guildId)) {
            return;
        }

        if (msg.author.id === getClient().client.user.id) {
            return;
        }

        await getClient().executeAllHandlers("resubmit", msg);
    }
};
