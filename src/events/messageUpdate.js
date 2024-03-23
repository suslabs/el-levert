import { getClient } from "../LevertClient.js";

export default {
    name: "messageUpdate",
    listener: async (_, msg) => {
        if (!getClient().shouldProcess(msg)) {
            return;
        }

        await getClient().executeAllHandlers("resubmit", msg);
    }
};
