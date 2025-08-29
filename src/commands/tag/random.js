import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "random",
    aliases: ["rand", "r"],
    parent: "tag",
    subcommand: true,

    handler: async function (args, msg) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("prefix")}`;
        }

        let [prefix, t_args] = ParserUtil.splitArgs(args);

        {
            let err;
            [prefix, err] = getClient().tagManager.checkName(prefix, false);

            if (err !== null) {
                return `:warning: ${err}.`;
            }
        }

        const name = await getClient().tagManager.random(prefix);

        if (name === null) {
            return `:warning: **No** tags matching the prefix were found.`;
        }

        return await this.parentCmd.handler(`${name} ${t_args}`, msg);
    }
};
