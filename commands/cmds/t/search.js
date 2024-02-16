import Util from "../../../util/Util.js";
import { getClient } from "../../../LevertClient.js";

export default {
    name: "search",
    parent: "tag",
    subcommand: true,
    handler: async args => {
        if (args.length === 0) {
            return ":information_source: `t search query`";
        }

        const [t_name] = Util.splitArgs(args),
            e = getClient().tagManager.checkName(t_name);

        if (e) {
            return ":warning: " + e;
        }

        const find = await getClient().tagManager.search(t_name);

        if (find.length < 1) {
            return ":information_source: Found no similar tags.";
        }

        return `:information_source: Found next similar tags: **${find.join("**, **")}**.`;
    }
};
