import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";

class TagDumpCommand {
    static info = {
        name: "dump",
        aliases: ["all", "list_all"],
        parent: "tag",
        subcommand: true,
        args: "[inline|full] [spaces]",
        description:
            "Exports registered tags from the database. When called with 'full', exports a complete JSON file containing tag metadata and content. Without arguments or with 'inline', outputs tag names.",
        usage: "- [inline|full]: Dump format mode ('full' for JSON export, 'inline' for name list).\n- [spaces]: Number of indentation spaces for full JSON dump.",
        arguments: [
            {
                name: "dumpType",
                kind: "positional",
                index: 0,
                lowercase: true
            },
            {
                name: "spacingText",
                kind: "positional",
                index: 1,
                lowercase: true
            }
        ]
    };

    async handler(ctx) {
        const d_type = ctx.arg("dumpType"),
            s_text = ctx.arg("spacingText"),
            full = d_type === "full",
            inline = d_type === "inline";

        let tags = await getClient().tagManager.dump(full);

        if (Util.empty(tags)) {
            return `${getEmoji("info")} There are **no** tags registered.`;
        }

        if (full) {
            let spaces = 0;

            if (!Util.empty(s_text)) {
                spaces = Util.parseInt(s_text);

                if (Number.isNaN(spaces) || spaces < 0) {
                    return `${getEmoji("warn")} Invalid indentation: ${s_text}`;
                }
            }

            return DiscordUtil.getFileAttach(
                JSON.stringify(
                    tags.map(tag => tag.getData()),
                    undefined,
                    spaces
                ),
                "tags.json"
            );
        }

        const format = tags.join(inline ? "," : "\n");
        return DiscordUtil.getFileAttach(format, "tags.txt");
    }
}

export default TagDumpCommand;
