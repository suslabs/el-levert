import { inlineCode } from "discord.js";

import Util from "../../util/Util.js";

const defaultValues = {
    id: 0,
    user: "0",
    group: "",
    username: ""
};

class User {
    static defaultValues = defaultValues;

    constructor(data) {
        Util.setValuesWithDefaults(this, data, defaultValues);
    }

    setUserId(id) {
        this.user = id;
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

    format(discord = false) {
        if (this.username.length > 0) {
            const formattedUser = discord ? inlineCode(this.user) : this.user;
            return `${this.username} (${formattedUser})`;
        }

        if (discord) {
            return inlineCode(this.user);
        }

        return this.user;
    }
}

export default User;
