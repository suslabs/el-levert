import { bold } from "discord.js";

import Util from "../../util/Util.js";

const defaultValues = {
    name: "",
    level: 0,
    users: []
};

const indentation = 4;

class Group {
    static defaultValues = defaultValues;

    constructor(data) {
        Util.setValuesWithDefaults(this, data, defaultValues);
    }

    setUsers(users) {
        const groupUsers = users.filter(user => user.group === this.name);

        this.users = groupUsers;
    }

    formatUsers(discord = false) {
        const formattedName = discord ? bold(this.name) : this.name,
            formattedLevel = discord ? bold(this.level) : this.level,
            s = this.users.length > 1 ? "s" : "",
            title = `Group ${formattedName} - Level ${formattedLevel} - User${s}:`;

        const indent = discord ? "" : " ".repeat(indentation);

        let userFormat;

        if (this.users.length > 0) {
            userFormat = this.users
                .map((user, i) => {
                    const name = user.format(discord);
                    return `${indent}${discord ? "-" : `${i + 1}.`} ${name}`;
                })
                .join("\n");
        } else {
            userFormat = `${indent}None`;
        }

        const format = `${title}\n${userFormat}`;
        return format;
    }

    format() {
        return `${this.name} - ${this.level}`;
    }
}

export default Group;
