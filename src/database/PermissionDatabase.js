import SqlDatabase from "./SqlDatabase.js";

import Group from "../structures/permission/Group.js";
import User from "../structures/permission/User.js";

import Util from "../util/Util.js";

class PermissionDatabase extends SqlDatabase {
    async fetch(id) {
        const rows = await this.userQueries.fetch.all({
            $user: id
        });

        if (typeof rows._data === "undefined" || Util.empty(rows)) {
            return null;
        }

        return rows.map(row => new Group(row));
    }

    async add(group, user) {
        return await this.userQueries.add.run({
            $user: user.user,
            $group: group.name
        });
    }

    async remove(group, user) {
        return await this.userQueries.remove.run({
            $user: user.user,
            $group: group.name
        });
    }

    async removeByGroup(group) {
        return await this.userQueries.removeByGroup.run({
            $name: group.name
        });
    }

    async removeAll(user) {
        return await this.userQueries.removeAll.run({
            $user: user.user
        });
    }

    async transferUsers(group, newGroup) {
        return await this.userQueries.transfer.run({
            $group: group.name,
            $newGroup: newGroup.name
        });
    }

    async fetchGroup(name) {
        const row = await this.groupQueries.fetch.get({
            $name: name
        });

        if (typeof row._data === "undefined") {
            return null;
        }

        return new Group(row);
    }

    async fetchByLevel(level) {
        const row = await this.groupQueries.fetchByLevel.get({
            $level: level
        });

        if (typeof row._data === "undefined") {
            return null;
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
        return await this.groupQueries.remove.run({
            $name: group.name
        });
    }

    async updateGroup(group, newGroup) {
        return await this.groupQueries.update.run({
            $name: group.name,
            $newName: newGroup.name,
            $newLevel: newGroup.level
        });
    }

    async listGroups() {
        const rows = await this.groupQueries.list.all(),
            groups = rows.map(row => new Group(row));

        groups.sort((a, b) => b.level - a.level);
        return groups;
    }

    async listUsers() {
        const rows = await this.userQueries.list.all();

        return rows.map(row => new User(row));
    }
}

export default PermissionDatabase;
