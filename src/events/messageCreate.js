import { getClient } from "../LevertClient.js";

export default {
    name: "messageCreate",
    listener: async msg => {
        if (msg.author.id === getClient().client.user.id) {
            return;
        }

        await getClient().executeAllHandlers("execute", msg);
    }
};
