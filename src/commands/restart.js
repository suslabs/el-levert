import { getClient } from "../LevertClient.js";

export default {
    name: "restart",
    load: function () {
        this.allowed = getClient().permManager.ownerLevel;
    },
    handler: async (args, msg, perm) => {
        await getClient().restart();

        const id = msg.channel.id;
        delete msg.channel;
        Object.defineProperty(msg, "channel", {
            value: getClient().getChannel(id, undefined, false)
        });

        return ":white_check_mark: Restarted client!";
    }
};
