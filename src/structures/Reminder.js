import { escapeMarkdown, TimestampStyles, bold } from "discord.js";

import BaseStructure from "./BaseStructure.js";

import Util from "../util/Util.js";
import DiscordUtil from "../util/DiscordUtil.js";
import IntervalUtil from "../util/date/IntervalUtil.js";

class Reminder extends BaseStructure {
    static defaultValues = {
        id: 0,
        user: "0",
        start: 0,
        end: null,
        msg: "",
        interval: null
    };

    static dataProps = ["id", "user", "start", "end", "msg", "interval"];
    static nullableDataProps = ["msg", "end", "interval"];

    constructor(data) {
        super(data);
    }

    get hasMessage() {
        return !Util.empty(this.msg);
    }

    get isRecurring() {
        return this.interval !== null;
    }

    getOccurrenceIndex(date = Date.now(), next = false) {
        if (date < this.start) {
            return next ? 0 : null;
        } else if (!this.isRecurring) {
            return 0;
        }

        const idx = IntervalUtil.getIndex(this.start, this.interval, date) + Number(next);
        return this.end === null ? idx : Math.min(idx, IntervalUtil.getIndex(this.start, this.interval, this.end));
    }

    getOccurrence(idx, next = false) {
        idx += Number(next);

        if (idx < 0 || (!this.isRecurring && idx !== 0)) {
            return null;
        }

        const occurrence = this.isRecurring ? IntervalUtil.getOccurrence(this.start, this.interval, idx) : this.start;
        return this.end === null || occurrence <= this.end ? occurrence : null;
    }

    getTimestamp(discord = true, style = TimestampStyles.ShortDateTime) {
        return DiscordUtil.formatTimestamp(this.getOccurrence(this.getOccurrenceIndex(Date.now(), true)), {
            discord,
            style
        });
    }

    format(includeMsg = true, discord = true) {
        let format = this.getTimestamp(discord);

        if (this.isRecurring) {
            format += ` (every ${IntervalUtil.format(this.interval)}`;

            if (this.end !== null) {
                format += ` until ${DiscordUtil.formatTimestamp(this.end, { discord, style: TimestampStyles.ShortDateTime })}`;
            }

            format += ")";
        }

        if (includeMsg && this.hasMessage) {
            const formattedMsg = discord ? bold(escapeMarkdown(this.msg)) : this.msg;
            format += ` with the message:\n${formattedMsg}`;
        }

        return format;
    }
}

export default Reminder;
