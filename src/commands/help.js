import { getClient } from "../LevertClient.js";

export default {
    name: "help",
    handler: (args, msg, perm) => {
        const cmdNames = getClient()
            .commandManager.commands.filter(x => !x.isSubcmd)
            .filter(x => perm >= x.allowed)
            .map(x => {
                if (x.aliases.length > 0) {
                    return [x.name].concat(x.aliases).join("/");
                }

                return x.name;
            });

        cmdNames.sort();
        const format = `\`${cmdNames.join("`, `")}\``;

        return `:information_source: Available commands are: ${format}
Use %(command) -help for per-command help when available.`;
    }
};
