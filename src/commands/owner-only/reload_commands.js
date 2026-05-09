import { getClient, getEmoji } from "../../LevertClient.js";

class ReloadCommandsCommand {
    static info = {
        name: "reload_commands",
        ownerOnly: true,
        category: "owner-only"
    };

    async handler() {
        getClient().silenceDiscordTransports(true);

        const res = await getClient().commandManager.reloadCommands();

        getClient().silenceDiscordTransports(false);

        if (res === null) {
            return `${getEmoji("error")} Reloading commands failed.`;
        } else if (res.total < 1) {
            return `${getEmoji("info")} No commands were reloaded.`;
        } else {
            const { ok, bad, total } = res,
                s = total > 1 ? "s" : "";

            return `${getEmoji("ok")} Reloaded **${total}** command${s}. **${ok}** successful, **${bad}** failed.`;
        }
    }
}

export default ReloadCommandsCommand;
