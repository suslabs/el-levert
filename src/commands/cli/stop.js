import { getClient } from "../../LevertClient.js";

export default {
    name: "stop",

    handler: async _ => {
        await getClient().stop(true);
    }
};
