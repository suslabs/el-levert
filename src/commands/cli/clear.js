import { getClient } from "../../LevertClient.js";

export default {
    name: "clear",

    handler: _ => {
        console.clear();
    }
};
