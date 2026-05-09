import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagQuotaCommand {
    static info = {
        name: "quota",
        parent: "tag",
        subcommand: true
    };

    async handler(ctx) {
        const tags = await getClient().tagManager.list(ctx.msg.author.id);

        if (tags.count === 0) {
            return `${getEmoji("info")} You have **no** tags.`;
        }

        const quota = await getClient().tagManager.getQuota(ctx.msg.author.id);

        if (quota <= 0) {
            return `${getEmoji("info")} You aren't using any of the available storage.`;
        }

        const maxQuota = getClient().tagManager.maxQuota,
            perc = Util.round((quota / maxQuota) * 100, 2),
            roundedMaxQuota = Util.smallRound(maxQuota, 2),
            roundedOwnQuota = Util.smallRound(quota, 2);

        return `${getEmoji("info")} You're using **${roundedOwnQuota}/${roundedMaxQuota} kb** of the available storage. (**${perc}%**)`;
    }
}

export default TagQuotaCommand;
