import loadConfig from "../../config/loadConfig.js";

import { getClient, getEmoji, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";

class RestartCommand {
    static info = {
        name: "restart",
        aliases: ["reload"],
        ownerOnly: true,
        category: "owner-only"
    };

    async handler(ctx) {
        const time = await getClient().restart(() => {
            getLogger().info("Reloading configs...");
            return loadConfig(getLogger());
        });

        DiscordUtil.rebindMessage(ctx.msg, getClient().client);
        return `${getEmoji("ok")} Restarted bot in **${Util.formatNumber(time)} ms**.`;
    }
}

export default RestartCommand;
