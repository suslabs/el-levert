import { escapeMarkdown, bold } from "discord.js";

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
            const idx = discord ? "- " : "";
            userFormat = `${spaces}${idx}None`;
        } else {
            userFormat = this.users
                .map((user, i) => {
                    const idx = discord ? "-" : `${i + 1}.`,
                        name = user.format(discord);

                    return `${spaces}${idx} ${name}`;
                })
                .join("\n");
        }

        return `${title}\n${userFormat}`;
    }

    format(full = false, discord = false) {
        const formattedName = discord ? bold(escapeMarkdown(this.name)) : `"${this.name}"`,
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
