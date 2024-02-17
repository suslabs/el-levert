import { getClient } from "../../LevertClient.js";

export default {
    name: "version",
    handler: _ => {
        return `:information_source: Current version: **${getClient().version}**`;
    }
};
