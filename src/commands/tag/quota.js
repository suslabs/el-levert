import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagQuotaCommand {
    static info = {
        name: "quota",
        parent: "tag",
        subcommand: true,
        description:
            "Displays your current tag storage consumption in kilobytes and tag count, along with the allowed limits."
    };

    async handler(ctx) {
        const { quota, count } = await getClient().tagManager.getQuota(ctx.msg.author.id);

        if (count <= 0) {
            return `${getEmoji("info")} You have **no** tags.`;
        }

        const maxQuota = getClient().tagManager.maxQuota,
            maxTagCount = getClient().tagManager.maxTagCount;

        const roundedOwnQuota = Util.smallRound(quota, 2),
            tagsLabel = count === 1 ? "tag" : "tags";

        const countStr =
            maxTagCount === -1 || typeof maxTagCount !== "number"
                ? `**${count}** ${tagsLabel}`
                : `**${count}/${maxTagCount}** ${tagsLabel}`;

        if (quota <= 0) {
            return `${getEmoji("info")} You have ${countStr}, but aren't using any of the available storage.`;
        } else if (maxQuota === -1) {
            return `${getEmoji("info")} You're using **${roundedOwnQuota} kb** of the available storage across ${countStr}. (unlimited)`;
        }

        const perc = Util.round((quota / maxQuota) * 100, 2),
            roundedMaxQuota = Util.smallRound(maxQuota, 2);

        return `${getEmoji("info")} You're using **${roundedOwnQuota}/${roundedMaxQuota} kb** of the available storage across ${countStr}. (**${perc}%**)`;
    }
}

export default TagQuotaCommand;
