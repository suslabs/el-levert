import { inlineCode } from "discord.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";

class User {
    static defaultValues = {
        id: 0,
        user: "0",
        group: "",
        username: ""
    };

    constructor(data) {
        ObjectUtil.setValuesWithDefaults(this, data, this.constructor.defaultValues);
    }

    setUserId(id) {
        this.user = id;
    }

    setGroup(group) {
        this.group = group;
    }

    setUsername(username) {
        this.username = username ?? "NOT FOUND";
    }

    format(discord = false) {
        if (!Util.empty(this.username)) {
            const formattedUser = discord ? inlineCode(this.user) : this.user;
            return `${this.username} (${formattedUser})`;
        }

        return discord ? inlineCode(this.user) : this.user;
    }
}

export default User;
