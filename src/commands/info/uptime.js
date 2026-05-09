import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class UptimeCommand {
    static info = {
        name: "uptime",
        category: "info"
    };

    handler() {
        const uptime = Util.duration(getClient().uptime, {
            format: true,
            largestN: 3
        });

        const startedDate = new Date(getClient().startedAt).toLocaleString("en-GB", {
            weekday: "short",
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZoneName: "short",
            timeZone: "UTC"
        });

        return `${getEmoji("info")} The bot has been running for **${uptime}**. (since **${startedDate}**)`;
    }
}

export default UptimeCommand;
