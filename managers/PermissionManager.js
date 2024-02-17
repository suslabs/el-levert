import DBManager from "./DBManager.js";

import { getClient } from "../LevertClient.js";
import PermissionDatabase from "../database/permission/PermissionDatabase.js";

const isGroupName = name => {
    return /^[A-Za-z0-9\-_]+$/.test(name);
};

class PermissionManager extends DBManager {
    constructor() {
        super("permission", "perm_db.db", PermissionDatabase, "perm_db");

        this.owner = getClient().config.owner;
    }

    checkName(name) {
        if (name.length > this.maxGroupNameLength) {
            return `The group name can be at most ${this.maxGroupNameLength} characters long.`;
        } else if (!isGroupName(name)) {
            return "The group name must consist of Latin characters, numbers, _ or -.";
        }
    }

    async fetch(id) {
        if (id === this.owner) {
            return [
                {
                    name: "owner",
                    level: 2147483647
                }
            ];
        }

        return await this.perm_db.fetch(id);
    }

    async maxLevel(id) {
        const groups = await this.fetch(id);
        let maxLevel = 0;

        if (groups) {
            maxLevel = Math.max(...groups.map(x => x.level));
        }

        return maxLevel;
    }

    fetchGroup(name) {
        return this.perm_db.fetchGroup(name);
    }

    fetchByLevel(level) {
        return this.perm_db.fetchByLevel(level);
    }

    add(group, id) {
        return this.perm_db.add(group.name, id);
    }

    remove(group, id) {
        return this.perm_db.remove(group.name, id);
    }

    removeAll(id) {
        return this.perm_db.removeAll(id);
    }

    addGroup(name, level) {
        return this.perm_db.addGroup(name, level);
    }

    removeGroup(name) {
        return this.perm_db.removeGroup(name);
    }

    async list() {
        let users = await this.perm_db.listUsers(),
            groups = await this.perm_db.listGroups();

        if (groups.length < 1) {
            return false;
        }

        if (users.length < 1) {
            groups.forEach(x => (x.users = []));

            return groups;
        }

        for (const user of users) {
            const find = (await getClient().findUsers(user.id))[0];

            if (typeof find !== "undefined") {
                user.username = find.user.username;
            } else {
                user.username = "NOT FOUND";
            }
        }

        groups.forEach(x => (x.users = users.filter(y => y.group === x.name)));

        return groups;
    }
}

export default PermissionManager;
