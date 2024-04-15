import { inlineCode } from "discord.js";

import Util from "../../util/Util.js";

const defaultValues = {
    id: 0,
    user: "0",
    group: "",
    username: ""
};

class User {
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

    format() {
        if (this.username.length > 0) {
            return `${this.username} (${inlineCode(this.user)})`;
        }

        return inlineCode(this.user);
    }
}

export default User;
