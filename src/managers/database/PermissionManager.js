import DBManager from "./DBManager.js";
import PermissionDatabase from "../../database/PermissionDatabase.js";

import { DisabledGroup, OwnerGroup, OwnerUser } from "../../structures/permission/PermissionDefaults.js";
import Group from "../../structures/permission/Group.js";
import User from "../../structures/permission/User.js";

import PermissionError from "../../errors/PermissionError.js";

import Util from "../../util/Util.js";
import { getClient, getLogger } from "../../LevertClient.js";

class PermissionManager extends DBManager {
    static $name = "permManager";
    static loadPriority = 1;

    constructor(enabled) {
        super(enabled, "permission", PermissionDatabase, "perm_db");

        this.maxGroupNameLength = getClient().config.maxGroupNameLength;

        this.setOwner(getClient().owner);
        this.setLevels({
            disabledLevel: DisabledGroup.level,
            defaultLevel: Group.defaultValues.level,
            modLevel: getClient().config.tagModeratorLevel,
            adminLevel: getClient().config.permissionAdminLevel,
            ownerLevel: OwnerGroup.level
        });
    }

    setOwner(id) {
        const owner = new User(OwnerUser);
        owner.setUserId(id);

        this.owner = owner;
    }

    setLevels(levels) {
        const { disabledLevel, defaultLevel, modLevel, adminLevel, ownerLevel } = levels;

        this.disabledLevel = disabledLevel ?? this.disabledLevel;
        this.defaultLevel = defaultLevel ?? this.defaultLevel;

        this.modLevel = modLevel ?? this.modLevel;
        this.adminLevel = adminLevel ?? this.adminLevel;

        this.ownerLevel = ownerLevel ?? this.ownerLevel;
    }

    isGroupName(name) {
        return PermissionManager._groupNameRegex.test(name);
    }

    checkName(name) {
        if (name.length > this.maxGroupNameLength) {
            return `The group name can be at most ${this.maxGroupNameLength} characters long.`;
        }

        if (!this.isGroupName(name)) {
            return "The group name must consist of Latin characters, numbers, _ or -.";
        }

        return false;
    }

    checkLevel(level) {
        if (Number.isNaN(level) || level < 0) {
            throw new PermissionError("Invalid group level");
        }

        if (level <= this.defaultLevel) {
            throw new PermissionError("Group level must be higher than the default level");
        }

        return true;
    }

    getDefaultLevel() {
        if (!this.enabled) {
            return this.disabledLevel;
        }

        return this.defaultLevel;
    }

    isOwner(id) {
        return id === this.owner.user;
    }

    async fetch(id) {
        if (!this.enabled) {
            return [DisabledGroup];
        }

        if (id === this.owner.user) {
            return [OwnerGroup];
        }

        return await this.perm_db.fetch(id);
    }

    async fetchByLevel(level) {
        if (level === this.ownerLevel) {
            return [OwnerGroup];
        }

        return await this.perm_db.fetchByLevel(level);
    }

    async maxLevel(id) {
        const groups = await this.fetch(id);

        if (!groups) {
            return this.defaultLevel;
        }

        let maxLevel;

        if (groups.length === 1) {
            maxLevel = Util.firstElement(groups).level;
        } else {
            const levels = groups.map(x => x.level);
            maxLevel = Math.max(...levels);
        }

        return maxLevel;
    }

    async isInGroup(name, id) {
        const currentPerms = await getClient().permManager.fetch(id);

        return currentPerms && currentPerms.find(group => group.name === name);
    }

    async fetchGroup(name) {
        if (name === OwnerGroup.name) {
            return OwnerGroup;
        }

        return await this.perm_db.fetchGroup(name);
    }

    async add(group, id) {
        if (!group) {
            throw new PermissionError("Group doesn't exist");
        }

        if (group.name === OwnerGroup.name) {
            throw new PermissionError("Can't add a user to the owner group");
        }

        const user = new User({ user: id });

        await this.perm_db.add(group, user);

        getLogger().info(`Added user: ${id} to group: "${group}".`);
        return user;
    }

    async remove(group, id) {
        if (!group) {
            throw new PermissionError("Group doesn't exist");
        }

        if (group.name === OwnerGroup.name) {
            throw new PermissionError("Can't remove a user from the owner group");
        }

        const user = new User({ user: id }),
            res = await this.perm_db.remove(group, user);

        getLogger().info(`Removed user: ${id} from group: "${group}".`);
        return res.changes > 0;
    }

    async removeAll(id) {
        const user = new User({ user: id }),
            res = await this.perm_db.removeAll(user);

        getLogger().info(`Removed permissions for user: ${id}`);
        return res.changes > 0;
    }

    async addGroup(name, level) {
        if (name === OwnerGroup.name) {
            throw new PermissionError('Can\'t create a group with the name "owner"');
        }

        if (level >= this.ownerLevel) {
            throw new PermissionError("Can't create a group with a level higher or equal than the owner group");
        }

        const existingGroup = await getClient().permManager.fetchGroup(name);

        if (existingGroup) {
            throw new PermissionError("Group already exists");
        }

        this.checkLevel(level);

        const group = new Group({
            name,
            level
        });

        await this.perm_db.addGroup(group);

        getLogger().info(`Added group: "${name}" with level: ${level}`);
        return group;
    }

    async removeGroup(group) {
        if (!group) {
            throw new PermissionError("Group doesn't exist");
        }

        if (group.name === OwnerGroup.name) {
            throw new PermissionError("Can't remove the owner group");
        }

        await this.perm_db.removeByGroup(group);
        await this.perm_db.removeGroup(group);

        getLogger().info(`Removed group: "${group.name}"`);
        return group;
    }

    async updateGroup(group, newName, newLevel) {
        if (!group) {
            throw new PermissionError("Group doesn't exist");
        }

        if (group.name === newName) {
            throw new PermissionError("Can't update group with the same name");
        }

        if (group.level === newLevel) {
            throw new PermissionError("Can't update group with the same level");
        }

        let newGroup = new Group(group);

        if (typeof newName !== "undefined") {
            const existingGroup = await this.fetchGroup(newName);

            if (existingGroup) {
                throw new PermissionError("Group already exists");
            }

            newGroup.name = newName;
        }

        if (typeof newLevel !== "undefined") {
            this.checkLevel(newLevel);

            newGroup.level = newLevel;
        }

        await this.perm_db.updateGroup(group, newGroup);

        if (newGroup.name !== group.name) {
            await this.perm_db.transferUsers(group, newGroup);
        }

        getLogger().info(`Updated group: "${group.name}" with name: "${newName}", level: ${newLevel}`);
        return newGroup;
    }

    async listUsers(fetchUsernames = false) {
        let users = [];

        if (this.owner.user !== OwnerUser.user) {
            users = [this.owner];
        }

        const userList = await this.perm_db.listUsers();
        users = users.concat(userList);

        if (!fetchUsernames) {
            return users;
        }

        for (const user of users) {
            let find;

            try {
                find = await getClient().findUserById(user.user);
            } catch (err) {
                getLogger().error("Error occured while fetching user:", err);
            }

            user.setUsername(find?.username);
        }

        return users;
    }

    async listGroups(fetchUsernames = false) {
        let groups = [];

        if (this.owner.user !== OwnerUser.user) {
            groups = [OwnerGroup];
        }

        const groupList = await this.perm_db.listGroups();
        groups = groups.concat(groupList);

        if (groups.length < 1) {
            return false;
        }

        const users = await this.listUsers(fetchUsernames);

        for (const group of groups) {
            group.setUsers(users);
        }

        return groups;
    }

    static _groupNameRegex = /^[A-Za-z0-9\-_]+$/;
}

export default PermissionManager;
