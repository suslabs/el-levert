import BaseStructure from "../BaseStructure.js";

import DiscordUtil from "../../util/DiscordUtil.js";

class User extends BaseStructure {
    static defaultValues = {
        id: 0,
        user: "0",
        group: "",
        username: ""
    };

    static dataProps = ["id", "user", "group"];

    constructor(data) {
        super(data);
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
        return DiscordUtil.formatUser(this.username, this.user, discord);
    }
}

export default User;
