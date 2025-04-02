import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "uptime",

    handler: _ => {
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

        const uptime = Util.duration(getClient().uptime, {
            format: true,
            largestN: 3
        });

        return `The bot has been running for ${uptime} (since ${startedDate}).`;
    }
};
