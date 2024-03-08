import Database from "./Database.js";

import Group from "../structures/permission/Group.js";
import User from "../structures/permission/User.js";

class PermissionDatabase extends Database {
    async fetch(id) {
        const rows = await this.userQueries.fetch.all({
            $id: id
        });

        if (typeof rows === "undefined" || rows.length < 1) {
            return false;
        }

        return rows.map(row => new Group(row));
    }

    async add(group, user) {
        return await this.userQueries.add.run({
            $group: group.name,
            $id: user.id
        });
    }

    async remove(group, user) {
        return await this.userQueries.remove.run({
            $group: group.name,
            $id: user.id
        });
    }

    async removeAll(user) {
        return await this.userQueries.removeAll.run({
            $id: user.id
        });
    }

    async fetchGroup(name) {
        const row = await this.groupQueries.fetch.get({
            $name: name
        });

        if (typeof row === "undefined") {
            return false;
        }

        return new Group(row);
    }

    async fetchByLevel(level) {
        const row = await this.groupQueries.fetchByLevel.get({
            $level: level
        });

        if (typeof row === "undefined") {
            return false;
        }

        return new Group(row);
    }

    async addGroup(group) {
        return await this.groupQueries.add.run({
            $name: group.name,
            $level: group.level
        });
    }

    async removeGroup(group) {
        await this.userQueries.removeByGroup.run({
            $name: group.name
        });

        return await this.groupQueries.remove.run({
            $name: group.name
        });
    }

    async listUsers() {
        const rows = await this.userQueries.list.all();

        return rows.map(row => new User(row));
    }

    async listGroups() {
        const rows = await this.groupQueries.list.all();

        return rows.map(row => new Group(row));
    }
}

export default PermissionDatabase;
