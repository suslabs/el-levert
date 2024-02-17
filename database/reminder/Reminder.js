import crypto from "crypto";

function generateId() {
    const index = crypto.randomBytes(5).toString("hex");
    return index + "-" + Math.floor(Date.now() / 1000).toString();
}

class Reminder {
    constructor(options) {
        Object.assign(this, {
            user: "0",
            end: 0,
            msg: "",
            ...options
        });

        if (typeof this.id === "undefined") {
            this.id = generateId();
        }
    }
}

export default Reminder;
