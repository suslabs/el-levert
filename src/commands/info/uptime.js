import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DateUtil from "../../util/date/DateUtil.js";

class UptimeCommand {
    static info = {
        name: "uptime",
        description: "Show how long the bot has been running.",
        category: "info"
    };

    handler() {
        const uptime = Util.duration(getClient().uptime, {
            format: true,
            largestN: 3
        });

        const startedDate = DateUtil.formatDate(getClient().startedAt);

        return `${getEmoji("info")} The bot has been running for **${uptime}**. (since **${startedDate}**)`;
    }
}

export default UptimeCommand;
