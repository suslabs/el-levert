import { getClient, getLogger } from "../../LevertClient.js";

import loadConfig from "../../config/loadConfig.js";
import Util from "../../util/Util.js";

function configReloader() {
    getLogger().info("Reloading configs...");
    return loadConfig(getLogger());
}

function rebindMessage(msg, client) {
    const id = msg.channel.id;
    delete msg.channel;

    const channel = client.channels.cache.get(id);
    Object.defineProperty(msg, "channel", {
        value: channel
    });
}

export default {
    name: "restart",
    aliases: ["reload"],
    ownerOnly: true,
    category: "owner-only",

    handler: async (_, msg) => {
        const time = await getClient().restart(configReloader);
        rebindMessage(msg, getClient().client);

        return `:white_check_mark: Restarted bot in **${Util.formatNumber(time)} ms**.`;
    }
};
