const defaultValues = {
    name: "",
    level: 0,
    users: []
};

const indent = 4,
    spacing = " ".repeat(indent);

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
        let format = `Group ${this.name} - Level ${this.level} - User(s):\n`;

        if (this.users.length > 0) {
            const userFormat = this.users
                .map((user, i) => {
                    const name = user.format();
                    return `${spacing}${i + 1}. ${name}`;
                })
                .join("\n");

            format += userFormat;
        } else {
            format += `${spacing}None`;
        }

        return format;
    }

    format() {
        return `${this.name} - ${this.level}`;
    }
}

export default Group;
