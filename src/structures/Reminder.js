import { time, bold } from "discord.js";

import Util from "../util/Util.js";

const defaultValues = {
    id: 0,
    user: "0",
    end: 0,
    msg: ""
};

class Reminder {
    static defaultValues = defaultValues;

    constructor(data) {
        Util.setValuesWithDefaults(this, data, defaultValues);
    }

    get hasMessage() {
        return this.msg.length > 0;
    }

    isPast(date) {
        date ??= Date.now();
        return this.end <= date;
    }

    getTimestamp(style = "f") {
        const timestamp = Math.floor(this.end * Util.durationSeconds.milli);
        return time(timestamp, style);
    }

    format() {
        let format = this.getTimestamp();

        if (this.hasMessage) {
            format += ` with the message: ${bold(this.msg)}`;
        }

        return format;
    }
}

export default Reminder;
