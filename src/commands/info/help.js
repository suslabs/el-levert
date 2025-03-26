import { getClient } from "../../LevertClient.js";

export default {
    name: "help",
    category: "info",

    handler: function (_1, _2, perm) {
        const help = getClient().commandManager.getHelp(perm);

        return `:information_source: Available commands are:
${help}

Use \`${this.prefix}(command) -help\` for per-command help when available.`;
    }
};
