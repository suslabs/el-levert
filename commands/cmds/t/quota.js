import Util from "../../../util/Util.js";
import { getClient } from "../../../LevertClient.js";

export default {
    name: "quota",
    parent: "tag",
    subcommand: true,
    handler: async (_, msg) => {
        const quota = await getClient().tagManager.getQuota(msg.author.id),
            perc = Util.round((quota / getClient().config.maxQuota) * 100, 2);

        if (quota === false) {
            return ":information_source: You have no tags.";
        }

        return `:information_source: You're using **${Util.round(quota, 2)}/${
            getClient().config.maxQuota
        }kb** of the available storage (**${perc}%**).`;
    }
};
