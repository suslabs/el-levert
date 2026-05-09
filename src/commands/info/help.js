import { getClient, getEmoji } from "../../LevertClient.js";

class HelpCommand {
    static info = {
        name: "help",
        category: "info"
    };

    handler(ctx) {
        const help = getClient().commandManager.getHelp(ctx.perm);

        return `${getEmoji("info")} Available commands are:
${help}

Use \`${this.prefix}(command) -help\` for per-command help when available.`;
    }
}

export default HelpCommand;
