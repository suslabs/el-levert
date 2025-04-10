import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";

export default {
    name: "info",
    aliases: ["data"],
    parent: "tag",
    subcommand: true,
    allowed: getClient().permManager.modLevel,

    handler: async function (args) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("name")}`;
        }

        const [t_name, i_type] = ParserUtil.splitArgs(args, [true, true]),
            raw = i_type === "raw";

        if (this.matchesSubcmd(t_name)) {
            return `:police_car: **${t_name}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        const err = getClient().tagManager.checkName(t_name);

        if (err) {
            return `:warning: ${err}.`;
        }

        const tag = await getClient().tagManager.fetch(t_name);

        if (tag === null) {
            return `:warning: Tag **${t_name}** doesn't exist.`;
        }

        const header = `:information_source: Tag info for **${t_name}**:`;

        const info = await tag.getInfo(raw),
            infoJson = JSON.stringify(info, undefined, 4);

        if (infoJson.length + 10 > getClient().commandHandler.outCharLimit) {
            return {
                content: header,
                ...DiscordUtil.getFileAttach(infoJson, "info.json")
            };
        } else {
            return `${header}
\`\`\`json
${infoJson}
\`\`\``;
        }
    }
};
