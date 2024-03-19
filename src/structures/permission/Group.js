import Util from "../../util/Util.js";

const defaultValues = {
    name: "",
    level: 0,
    users: []
};

const indent = " ";

class Group {
    constructor(data) {
        Object.assign(this, {
            ...defaultValues,
            ...data
        });
    }

    setUsers(users) {
        const groupUsers = users.filter(user => user.group === this.name);

        this.users = groupUsers;
    }

    formatUsers() {
        let format = `Group ${Util.bold(this.name)} - Level ${this.level} - User(s):\n`;

        if (this.users.length > 0) {
            const userFormat = this.users
                .map((user, i) => {
                    const name = user.format();
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
