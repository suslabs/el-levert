import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "info",
    aliases: ["data"],
    parent: "tag",
    subcommand: true,
    allowed: getClient().permManager.modLevel,

    handler: async function (args) {
        if (args.length === 0) {
            return ":information_source: `t info name`";
        }

        const [t_name, i_type] = Util.splitArgs(args, [true, true]),
            raw = i_type === "raw";

        if (this.isSubName(t_name)) {
            return `:police_car: **${t_name}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        const e = getClient().tagManager.checkName(t_name);
        if (e) {
            return ":warning: " + e;
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if (!tag) {
            return `:warning: Tag **${t_name}** doesn't exist.`;
        }

        const info = await tag.getInfo(raw);

        return `:information_source: Tag info for **${t_name}**:
\`\`\`js
${JSON.stringify(info, undefined, 4)}
\`\`\``;
    }
};
