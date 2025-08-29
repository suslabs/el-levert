import { getClient } from "../../LevertClient.js";

import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "set_type",
    parent: "tag",
    subcommand: true,
    allowed: "mod",

    handler: async function (args) {
        if (args.length < 2) {
            return `:information_source: ${this.getArgsHelp("name (version/type)")}`;
        }

        let [t_name, t_args] = ParserUtil.splitArgs(args, true);

        if (this.matchesSubcmd(t_name)) {
            return `:police_car: **${t_name}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        {
            let err;
            [t_name, err] = getClient().tagManager.checkName(t_name, false);

            if (err !== null) {
                return `:warning: ${err}.`;
            }
        }

        let [type, version] = ParserUtil.splitArgs(t_args, [true, true]),
            setVersion = type === "version";

        const tag = await getClient().tagManager.fetch(t_name);

        if (tag === null) {
            return `:warning: Tag **${t_name}** doesn't exist.`;
        }

        if (setVersion) {
            tag.setVersion(version);
        } else {
            tag.setType(type);
        }

        try {
            await getClient().tagManager.updateProps(t_name, tag, {
                validateNew: false,
                checkExisting: false
            });
        } catch (err) {
            if (err.name !== "TagError") {
                throw err;
            }

            return `:warning: ${err.message}.`;
        }

        return `:white_check_mark: Updated tag **${t_name}**.`;
    }
};
