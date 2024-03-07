import { time, bold } from "discord.js";
import crypto from "crypto";

function generateId() {
    const id = crypto.randomBytes(5).toString("hex");
    return id + "-" + Math.floor(Date.now() / 1000).toString();
}

const defaultValues = {
    user: "0",
    end: 0,
    msg: ""
};

class Reminder {
    constructor(data) {
        Object.assign(this, {
            ...defaultValues,
            ...data
        });

        if (typeof this.id === "undefined") {
            this.id = generateId();
        }
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
