import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagRandomCommand {
    static info = {
        name: "random",
        aliases: ["rand", "r"],
        parent: "tag",
        subcommand: true,
        args: "<prefix> [tag_args]",
        description:
            "Randomly selects and executes a registered tag whose name starts with the given prefix, forwarding any additional arguments.",
        usage: "- <prefix>: Tag name prefix to match against.\n- [tag_args]: Optional arguments passed to the executed tag.",
        parser: {
            requireArgs: true
        },
        arguments: [
            {
                name: "prefix",
                kind: "positional",
                index: 0
            },
            {
                name: "tagArgs",
                kind: "positional",
                index: 1
            }
        ]
    };

    async handler(ctx) {
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

        const tagContext = this.parentCmd.createContext(ctx.withArgs([name, t_args].filter(Boolean).join(" ")));

        return await this.parentCmd.handler(tagContext);
    }
}

export default TagRandomCommand;
