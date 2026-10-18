import { escapeMarkdown, time, TimestampStyles, bold } from "discord.js";

import BaseStructure from "./BaseStructure.js";

import Util from "../util/Util.js";
import DateUtil from "../util/commands/DateUtil.js";

class Reminder extends BaseStructure {
    static defaultValues = {
        id: 0,
        user: "0",
        end: 0,
        msg: "",
        interval: null
    };

    static dataProps = ["id", "user", "end", "msg", "interval"];
    static nullableDataProps = ["msg", "interval"];

    constructor(data) {
        super(data);
    }

    get hasMessage() {
        return !Util.empty(this.msg);
    }

    get isRecurring() {
        return this.interval !== null && this.interval > 0;
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

        if (this.isRecurring) {
            format += ` (every ${DateUtil.formatInterval(this.interval)})`;
        }

        if (this.hasMessage) {
            const formattedMsg = discord ? bold(escapeMarkdown(this.msg)) : this.msg;
            format += ` with the message:\n${formattedMsg}`;
        }

        return format;
    }
}

export default Reminder;
