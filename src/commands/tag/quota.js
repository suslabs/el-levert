import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "quota",
    parent: "tag",
    subcommand: true,

    handler: async (_, msg) => {
        const tags = await getClient().tagManager.list(msg.author.id);

        if (tags.count === 0) {
            return ":information_source: You have no tags.";
        }

        const quota = await getClient().tagManager.getQuota(msg.author.id);

        if (quota === 0) {
            return `:information_source: You aren't using any of the available storage.`;
        }

        const maxQuota = getClient().config.maxQuota,
            perc = Util.round((quota / maxQuota) * 100, 2),
            roundedQuota = Util.round(quota, 2);

        return `:information_source: You're using **${roundedQuota}/${maxQuota}kb** of the available storage (**${perc}%**).`;
    }
};
