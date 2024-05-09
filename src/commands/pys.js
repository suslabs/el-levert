import { getLogger } from "../LevertClient.js";

export default {
    name: "pys",
    category: "kys",
    handler: _ => {
        for (let i = 1; i <= 100; i++) {
            getLogger().info(i.toString());
        }

        return "pys";
    }
};
