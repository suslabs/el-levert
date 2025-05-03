import { getClient } from "../../LevertClient.js";

export default {
    name: "reload_commands",
    ownerOnly: true,
    category: "owner-only",

    handler: async _ => {
        getClient().silenceDiscordTransports(true);

        const res = await getClient().commandManager.reloadCommands();

        getClient().silenceDiscordTransports(false);

        if (typeof res === "undefined") {
            return ":no_entry_sign: Reloading commands failed.";
        } else if (res.total < 1) {
            return ":information_source: No commands were reloaded.";
        } else {
            const { ok, bad, total } = res,
                s = total > 1 ? "s" : "";

            return `:white_check_mark: Reloaded **${total}** command${s}. **${ok}** successful, **${bad}** failed.`;
        }
    }
};
