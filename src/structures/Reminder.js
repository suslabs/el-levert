import { TimestampStyles, time, bold } from "discord.js";

import Util from "../util/Util.js";

class Reminder {
    static defaultValues = {
        id: 0,
        user: "0",
        end: 0,
        msg: ""
    };

    constructor(data) {
        Util.setValuesWithDefaults(this, data, Reminder.defaultValues);
    }

    get hasMessage() {
        return this.msg.length > 0;
    }

    isPast(date) {
        date ??= Date.now();
        return this.end <= date;
    }

    getTimestamp(discord = true, style = TimestampStyles.ShortDateTime) {
        if (discord) {
            const timestamp = Math.floor(this.end * Util.durationSeconds.milli);
            return time(timestamp, style);
        }

        const endDate = new Date(this.end);

        return endDate.toLocaleString("en-GB", {
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
    }

    format(discord = true) {
        let format = this.getTimestamp(discord);

        if (this.hasMessage) {
            const formattedMsg = discord ? bold(this.msg) : this.msg;
            format += ` with the message: ${formattedMsg}`;
        }

        return format;
    }
}

export default Reminder;
