import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "random",
    aliases: ["rand", "r"],
    parent: "tag",
    subcommand: true,

    handler: async function (args, msg) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("prefix")}`;
        }

        const [prefix, t_args] = Util.splitArgs(args);

        const err = getClient().tagManager.checkName(prefix);

        if (err ?? e2) {
            return ":warning: " + err;
        }

        const name = await getClient().tagManager.random(prefix);

        if (name === null) {
            return `:warning: **No** tags matching the prefix were found.`;
        }

        return await this.parentCmd.handler(`${name} ${t_args}`, msg);
    }
};
