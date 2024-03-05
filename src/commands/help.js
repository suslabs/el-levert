import { getClient } from "../LevertClient.js";

export default {
    name: "help",
    handler: (args, msg, perm) => {
        const help = getClient().commandManager.getHelp(perm);

        return `:information_source: Available commands are: ${help}
Use %(command) -help for per-command help when available.`;
    }
};
