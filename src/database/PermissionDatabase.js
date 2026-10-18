import RevisionDatabase from "./RevisionDatabase.js";

import Group from "../structures/permission/Group.js";
import User from "../structures/permission/User.js";

import Util from "../util/Util.js";
import ObjectUtil from "../util/ObjectUtil.js";
import DatabaseUtil from "../util/database/DatabaseUtil.js";

class PermissionDatabase extends RevisionDatabase {
    constructor(dbPath, queryPath, options) {
        options = ObjectUtil.guaranteeObject(options);

        const customFunctions = new Map();

        super(dbPath, queryPath, {
            ...options,
            customFunctions
        });
    }

    async groupExists(name) {
        return await DatabaseUtil.exists(name, this.groupQueries.exists, this.groupQueries.existsMultiple, "name");
    }

    async fetchGroup(name) {
        const row = await this.groupQueries.fetch.get({
            $name: name
        });

        return DatabaseUtil.rowEntity(row, Group);
    }

    async fetchByLevel(level) {
        const row = await this.groupQueries.fetchByLevel.get({
            $level: level
        });

        return DatabaseUtil.rowEntity(row, Group);
    }

    async addGroup(group) {
        return await this.groupQueries.add.run({
            ...group.getData("$")
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
            groups = DatabaseUtil.rowEntity(rows, Group);

        groups.sort((a, b) => b.level - a.level);
        return groups;
    }

    async userExists(id) {
        return await DatabaseUtil.exists(id, this.userQueries.exists, this.userQueries.existsMultiple, "user");
    }

    async fetch(id) {
        const rows = await this.userQueries.fetch.all({
            $user: id
        });

        if (Util.empty(rows)) {
            return null;
        }

        return DatabaseUtil.rowEntity(rows, Group);
    }

    async fetchUsersByGroup(name) {
        const rows = await this.userQueries.fetchByGroup.all({
            $name: name
        });

        return DatabaseUtil.rowEntity(rows, User);
    }

    async fetchUsersByUser(user) {
        const rows = await this.userQueries.fetchByUser.all({
            $user: user
        });

        return DatabaseUtil.rowEntity(rows, User);
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

    async listUsers() {
        const rows = await this.userQueries.list.all();
        return DatabaseUtil.rowEntity(rows, User);
    }
}

export default PermissionDatabase;
