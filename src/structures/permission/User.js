import { inlineCode } from "discord.js";

import Util from "../../util/Util.js";

class User {
    static defaultValues = {
        id: 0,
        user: "0",
        group: "",
        username: ""
    };

    constructor(data) {
        Util.setValuesWithDefaults(this, data, User.defaultValues);
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
        if (!Util.empty(this.username)) {
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
