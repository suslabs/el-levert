import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DateUtil from "../../util/misc/DateUtil.js";

class UptimeCommand {
    static info = {
        name: "uptime"
    };

    handler() {
        const uptime = Util.duration(getClient().uptime, {
            format: true,
            largestN: 3
        });

        const startedDate = DateUtil.formatDate(getClient().startedAt);

        return `The bot has been running for ${uptime}. (since ${startedDate})`;
    }
}

export default UptimeCommand;
