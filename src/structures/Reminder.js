import { escapeMarkdown, time, TimestampStyles, bold } from "discord.js";

import Util from "../util/Util.js";
import ObjectUtil from "../util/ObjectUtil.js";

class Reminder {
    static defaultValues = {
        id: 0,
        user: "0",
        end: 0,
        msg: ""
    };

    constructor(data) {
        ObjectUtil.setValuesWithDefaults(this, data, this.constructor.defaultValues);
    }

    get hasMessage() {
        return !Util.empty(this.msg);
    }

    getData(prefix = "", nullable = true, props = this.constructor.dataProps) {
        const data = ObjectUtil.filterObject(this, key => props.includes(key));

        if (nullable) {
            for (const prop of this.constructor._nullableDataProps.filter(prop => props.includes(prop))) {
                data[prop] ||= null;
            }
        }

        return Object.fromEntries(Object.entries(data).map(entry => [prefix + entry[0], entry[1]]));
    }

    isPast(date) {
        date ??= Date.now();
        return this.end <= date;
    }

    getTimestamp(discord = true, style = TimestampStyles.ShortDateTime) {
        if (discord) {
            const timestamp = Math.round(this.end * Util.durationSeconds.milli);
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
            const formattedMsg = discord ? bold(escapeMarkdown(this.msg)) : this.msg;
            format += ` with the message: ${formattedMsg}`;
        }

        return format;
    }

    static dataProps = ["id", "user", "end", "msg"];
    static _nullableDataProps = [];
}

export default Reminder;
