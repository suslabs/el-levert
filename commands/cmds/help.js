import { getClient } from "../../LevertClient.js";

export default {
    name: "help",
    handler: (args, msg, perm) => {
        const cmdNames = getClient().commands.filter(x => !x.isSubcmd)
                                             .filter(x => perm >= x.allowed)
                                             .map(x => x.name);

        cmdNames.sort();
        
        return `:information_source: Available commands are: \`${cmdNames.join("`, `")}\`
Use %(command) -help for per-command help when available.`;
    }
}