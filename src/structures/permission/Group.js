import { bold } from "discord.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";

class Group {
    static defaultValues = {
        name: "",
        level: 0,
        users: []
    };

    constructor(data) {
        ObjectUtil.setValuesWithDefaults(this, data, this.constructor.defaultValues);
    }

    setName(name) {
        this.name = name;
        return true;
    }

    setLevel(level) {
        this.level = level;
        return true;
    }

    setUsers(users) {
        const groupUsers = users.filter(user => user.group === this.name);

        this.users = groupUsers;
        return true;
    }

    formatUsers(full = false, discord = false) {
        const spaces = discord ? "" : this._spaces;

        let title = this.format(full, discord),
            userFormat;

        if (full) {
            const s = Util.single(this.users) ? "" : "s";
            title += ` - User${s}:`;
        }

        if (Util.empty(this.users)) {
            userFormat = `${spaces}${discord ? "- " : ""}None`;
        } else {
            userFormat = this.users
                .map((user, i) => {
                    const name = user.format(discord);
                    return `${spaces}${discord ? "-" : `${i + 1}.`} ${name}`;
                })
                .join("\n");
        }

        const format = `${title}\n${userFormat}`;
        return format;
    }

    format(full = false, discord = false) {
        const formattedName = discord ? bold(this.name) : `"${this.name}"`,
            formattedLevel = discord ? bold(this.level) : this.level;

        if (full) {
            return `Group ${formattedName} - Level ${formattedLevel}`;
        } else {
            return `${formattedName} - ${formattedLevel}`;
        }
    }

    static _indentation = 4;
    static _spaces = " ".repeat(this._indentation);
}

export default Group;
