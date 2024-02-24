import { time } from "discord.js";
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
    constructor(options) {
        Object.assign(this, {
            ...defaultValues,
            ...options
        });

        if (typeof this.id === "undefined") {
            this.id = generateId();
        }
    }

    getTimestamp(style = "f") {
        const timestamp = Math.floor(this.end / 1000);
        return time(timestamp, style);
    }
}

export default Reminder;
