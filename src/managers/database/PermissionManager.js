import DBManager from "./DBManager.js";

import { getClient } from "../../LevertClient.js";
import PermissionDatabase from "../../database/PermissionDatabase.js";

const isGroupName = name => {
    return /^[A-Za-z0-9\-_]+$/.test(name);
};

const disabledGroup = {
        name: "",
        level: 0
    },
    ownerGroup = {
        name: "owner",
        level: 2147483647
    };

const ownerUser = {
    group: "owner",
    id: "0"
};

class PermissionManager extends DBManager {
    constructor(enabled = true) {
        super(enabled, "permission", PermissionDatabase, "perm_db");

        this.owner = getClient().owner;

        this.disabledGroup = disabledGroup;
        this.ownerGroup = ownerGroup;

        this.ownerLevel = ownerGroup.level;
        this.ownerUser = {
            ...ownerUser,
            id: this.owner
        };
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
            return [this.ownerGroup];
        }

        if (!this.enabled) {
            return [this.disabledGroup];
        }

        return await this.perm_db.fetch(id);
    }

    async maxLevel(id) {
        const groups = await this.fetch(id);
        let maxLevel = 0;

        if (groups) {
            if (groups.length === 1) {
                maxLevel = groups[0].level;
            } else {
                const levels = groups.map(x => x.level);
                maxLevel = Math.max(...levels);
            }
        }

        return maxLevel;
    }

    async fetchGroup(name) {
        if (name === "owner") {
            return ownerGroup;
        }

        return await this.perm_db.fetchGroup(name);
    }

    fetchByLevel(level) {
        if (level === this.ownerLevel) {
            return [this.ownerGroup];
        }

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
        let users = [],
            groups = [];

        if (this.owner !== "0") {
            groups = [this.ownerGroup];
            users = [this.ownerUser];
        }

        const userList = await this.perm_db.listUsers();
        users = users.concat(userList);

        const groupList = await this.perm_db.listGroups();
        groups = groups.concat(groupList);

        if (groups.length < 1) {
            return false;
        }

        groups.sort((a, b) => b.level - a.level);

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
