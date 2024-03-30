import { time, bold } from "discord.js";

import Util from "../util/Util.js";

const defaultValues = {
    user: "0",
    end: 0,
    msg: ""
};

class Reminder {
    constructor(data) {
        Util.setValuesWithDefaults(this, data, defaultValues);
    }

    get hasMessage() {
        return this.msg.length > 0;
    }

    isPast(date) {
        date = date ?? Date.now();
        return this.end <= date;
    }

    getTimestamp(style = "f") {
        const timestamp = Math.floor(this.end / 1000);
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
