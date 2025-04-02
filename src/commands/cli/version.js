import { getClient } from "../../LevertClient.js";

export default {
    name: "version",

    handler: _ => {
        return `Current bot version: ${getClient().version}`;
    }
};
