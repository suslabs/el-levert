import { inlineCode } from "discord.js";

const defaultValues = {
    id: "0",
    group: "",
    username: ""
};

class User {
    constructor(data) {
        Object.assign(this, {
            ...defaultValues,
            ...data
        });
    }

    setId(id) {
        this.id = id;
    }

    setGroup(group) {
        this.group = group;
    }

    setUsername(username) {
        if (typeof username === "undefined") {
            username = "NOT FOUND";
        }

        this.username = username;
    }

    format() {
        if (this.username.length > 0) {
            return `${this.username} (${inlineCode(this.id)})`;
        }

        return inlineCode(this.id);
    }
}

export default User;
