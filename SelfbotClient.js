import { Client } from "discord.js-selfbot-v13";

import { getLogger } from "./LevertClient.js";

function ready() {
    getLogger().info("Selfbot logged in as " + this.user.tag);
}

class SelfbotClient extends Client {
    constructor() {
        super({
            checkUpdate: false
        });

        this.once("ready", ready.bind(this));
    }

    getChannel(ch_id) {
        if(this.channels.cache.has(ch_id)) {
            return this.channels.cache.get(ch_id);
        }

        return false;
    }
}

export default SelfbotClient;