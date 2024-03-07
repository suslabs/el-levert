import Util from "../../util/Util.js";

import { getClient } from "../../LevertClient.js";

export default {
    name: "quota",
    parent: "tag",
    subcommand: true,
    handler: async (_, msg) => {
        let quota = await getClient().tagManager.getQuota(msg.author.id);

        if (!quota) {
            return ":information_source: You have no tags.";
        }

        const maxQuota = getClient().config.maxQuota,
            perc = Util.round((quota / maxQuota) * 100, 2),
            roundedQuota = Util.round(quota, 2);

        return `:information_source: You're using **${roundedQuota}/${maxQuota}kb** of the available storage (**${perc}%**).`;
    }
};
