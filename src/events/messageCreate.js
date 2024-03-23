import { getClient } from "../LevertClient.js";

export default {
    name: "messageCreate",
    listener: async msg => {
        if (!getClient().shouldProcess(msg)) {
            return;
        }

        await getClient().executeAllHandlers("execute", msg);
    }
};
