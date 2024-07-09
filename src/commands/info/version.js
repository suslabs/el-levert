import { getClient } from "../../LevertClient.js";

export default {
    name: "version",
    category: "info",

    handler: _ => {
        return `:information_source: Current bot version: **${getClient().version}**`;
    }
};
