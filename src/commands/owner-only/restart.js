import loadConfig from "../../config/loadConfig.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";

export default {
    name: "restart",
    aliases: ["reload"],
    ownerOnly: true,
    category: "owner-only",

    handler: async (_, msg) => {
        const time = await getClient().restart(() => {
            getLogger().info("Reloading configs...");
            return loadConfig(getLogger());
        });

        DiscordUtil.rebindMessage(msg, getClient().client);
        return `:white_check_mark: Restarted bot in **${Util.formatNumber(time)} ms**.`;
    }
};
