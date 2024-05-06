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
            s = this.users.length > 1 ? "s" : "";

        let format = `Group ${formattedName} - Level ${this.level} - User${s}:\n`;

        if (this.users.length > 0) {
            let indent = " ";

            if (!discord) {
                indent = indent.repeat(indentation);
            }

            const userFormat = this.users
                .map((user, i) => {
                    const name = user.format(discord);
                    return `${indent}${i + 1}. ${name}`;
                })
                .join("\n");

            format += userFormat;
        } else {
            format += `${indent}None`;
        }

        return format;
    }

    format() {
        return `${this.name} - ${this.level}`;
    }
}

export default Group;
