import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagRandomCommand {
    static info = {
        name: "random",
        aliases: ["rand", "r"],
        parent: "tag",
        subcommand: true,
        arguments: [
            {
                name: "prefix",
                parser: "split",
                index: 0
            },
            {
                name: "tagArgs",
                parser: "split",
                index: 1
            }
        ]
    };

    async handler(ctx) {

        if (Util.empty(ctx.argsText)) {
            return `${getEmoji("info")} ${this.getArgsHelp("prefix")}`;
        }

        let prefix = ctx.arg("prefix"),
            t_args = ctx.arg("tagArgs");

        {
            let err;
            [prefix, err] = getClient().tagManager.checkName(prefix, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        const name = await getClient().tagManager.random(prefix);

        if (name === null) {
            return `${getEmoji("warn")} **No** tags matching the prefix were found.`;
        }

        const tagContext = this.parentCmd.createContext(
            ctx.withArgs([name, t_args].filter(Boolean).join(" "))
        );

        return await this.parentCmd.handler(tagContext);
    }
}

export default TagRandomCommand;
