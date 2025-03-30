import { bold } from "discord.js";

import Util from "../../util/Util.js";

class Group {
    static defaultValues = {
        name: "",
        level: 0,
        users: []
    };

    constructor(data) {
        Util.setValuesWithDefaults(this, data, this.constructor.defaultValues);
    }

    setUsers(users) {
        const groupUsers = users.filter(user => user.group === this.name);

        this.users = groupUsers;
    }

    formatUsers(discord = false) {
        const formattedName = discord ? bold(this.name) : this.name,
            formattedLevel = discord ? bold(this.level) : this.level;

        const s = Util.single(this.users) ? "" : "s",
            title = `Group ${formattedName} - Level ${formattedLevel} - User${s}:`;

        const spaces = discord ? "" : this._spaces;

        let userFormat;

        if (!Util.empty(this.users)) {
            userFormat = this.users
                .map((user, i) => {
                    const name = user.format(discord);
                    return `${spaces}${discord ? "-" : `${i + 1}.`} ${name}`;
                })
                .join("\n");
        } else {
            userFormat = `${spaces}${discord ? "- " : ""}None`;
        }

        const format = `${title}\n${userFormat}`;
        return format;
    }

    format() {
        return `${this.name} - ${this.level}`;
    }

    static _indentation = 4;
    static _spaces = " ".repeat(this._indentation);
}

export default Group;
