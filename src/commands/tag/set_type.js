import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "set_type",
    parent: "tag",
    subcommand: true,
    allowed: getClient().permManager.modLevel,
    handler: async function (args) {
        if (args.length < 2) {
            return ":information_source: `t set_type name version/type`";
        }

        const [t_name, t_args] = Util.splitArgs(args);

        if (this.isSubName(t_name)) {
            return `:police_car: **${t_name}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        const e = getClient().tagManager.checkName(t_name);
        if (e) {
            return ":warning: " + e;
        }

        let [type, version] = Util.splitArgs(t_args),
            setVersion = type === "version";

        const tag = await getClient().tagManager.fetch(t_name);

        if (!tag) {
            return `:warning: Tag **${t_name}** doesn't exist.`;
        }

        if (setVersion) {
            tag.setVersion(version);
        } else {
            tag.setType(type);
        }

        try {
            await getClient().tagManager.updateProps(t_name, tag);
        } catch (err) {
            if (err.name === "TagError") {
                return `:warning: ${err.message}.`;
            }

            throw err;
        }

        return `:white_check_mark: Updated tag **${t_name}**.`;
    }
};
