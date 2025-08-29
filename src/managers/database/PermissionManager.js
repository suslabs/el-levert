import DBManager from "./DBManager.js";
import PermissionDatabase from "../../database/PermissionDatabase.js";

import { DisabledGroup, OwnerGroup, OwnerUser } from "../../structures/permission/PermissionDefaults.js";
import Group from "../../structures/permission/Group.js";
import User from "../../structures/permission/User.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";

import PermissionError from "../../errors/PermissionError.js";

class PermissionManager extends DBManager {
    static $name = "permManager";
    static loadPriority = 1;

    constructor(enabled) {
        super(enabled, "permission", "perm_db", PermissionDatabase);

        this.maxGroupNameLength = getClient().config.maxGroupNameLength;

        this.owner = getClient().owner;

        this.setLevels({
            disabledLevel: DisabledGroup.level,
            defaultLevel: Group.defaultValues.level,
            modLevel: getClient().config.tagModeratorLevel,
            adminLevel: getClient().config.permissionAdminLevel,
            ownerLevel: OwnerGroup.level
        });
    }

    get owner() {
        return this._owner;
    }

    set owner(id) {
        const owner = new User(OwnerUser);
        owner.setUserId(id);

        this._owner = owner;
    }

    isOwner(id) {
        return id === this.owner.user;
    }

    isGroupName(name) {
        return PermissionManager._groupNameRegex.test(name);
    }

    checkName(name, throwErrors = true, allowOwner = true) {
        let msg, ref;
        name = name.trim();

        const ownerName = OwnerGroup.name;

        if (typeof name !== "string" || Util.empty(name)) {
            msg = "Invalid group name";
        } else if (name.length > this.maxGroupNameLength) {
            msg = `The group name can be at most ${this.maxGroupNameLength} characters long`;
            ref = {
                nameLength: name.length,
                maxLength: this.maxGroupNameLength
            };
        } else if (!this.isGroupName(name)) {
            msg = "The group name must consist of Latin characters, numbers, _ or -";
            ref = { name };
        } else if (!allowOwner && name === ownerName) {
            msg = "The group name can't be the same as the owner group's";
            ref = { name, ownerName };
        }

        const errored = typeof msg !== "undefined";

        if (throwErrors) {
            return errored
                ? (() => {
                      throw new PermissionError(msg, ref);
                  })()
                : name;
        } else {
            return errored ? [null, msg] : [name, null];
        }
    }

    setLevels(levels) {
        this.disabledLevel = levels.disabledLevel ?? this.disabledLevel;
        this._defaultLevel = levels.defaultLevel ?? this._defaultLevel;

        this._ownerLevel = levels.ownerLevel ?? this._ownerLevel;

        this._modLevel = Util.clamp(levels.modLevel ?? this._modLevel, 0, this._ownerLevel);
        this._adminLevel = Util.clamp(levels.adminLevel ?? this._adminLevel, 0, this._ownerLevel);
    }

    getLevels() {
        return {
            disabled: this.disabledLevel,
            default: this.enabled ? this._defaultLevel : this.disabledLevel,

            owner: this._ownerLevel,

            mod: this._modLevel,
            admin: this._adminLevel
        };
    }

    checkLevel(level, throwErrors = true, allowOwner = true) {
        const { default: defaultLevel, owner: ownerLevel } = this.getLevels();

        let msg, ref;

        if (!Number.isInteger(level) || level < 0) {
            msg = "Invalid group level";
            ref = { level };
        } else if (level <= defaultLevel) {
            msg = "Group level must be higher than the default level";
            ref = { level, defaultLevel };
        } else if (!allowOwner && level >= ownerLevel) {
            msg = "Group level can't be higher or equal than the owner group";
            ref = { level, ownerLevel };
        }

        const errored = typeof msg !== "undefined";

        if (throwErrors) {
            return errored
                ? (() => {
                      throw new PermissionError(msg, ref);
                  })()
                : level;
        } else {
            return errored ? [null, msg] : [level, null];
        }
    }

    allowed(perm, level, validate = true) {
        if (!this.enabled) {
            return true;
        }

        if (validate) {
            perm = Util.clamp(perm, this._defaultLevel);
        }

        switch (typeof level) {
            case "string":
                var levelName = level;
                level = this.getLevels()[levelName];

                if (validate && typeof level === "undefined") {
                    throw new PermissionError("Unknown level name: " + levelName, levelName);
                }
            // eslint-disable-next-line no-fallthrough
            case "number":
                if (validate && !levelName) {
                    level = Util.clamp(level, this._defaultLevel);
                }

                return perm >= level;
            default:
                throw new PermissionError("Invalid level");
        }
    }

    async fetch(id) {
        if (!this.enabled) {
            return [DisabledGroup];
        } else if (id === this.owner.user) {
            return [OwnerGroup];
        }

        return await this.perm_db.fetch(id);
    }

    async fetchByLevel(level, validate = false) {
        if (level === this._ownerLevel) {
            return [OwnerGroup];
        } else if (validate) {
            level = this.checkLevel(level);
        }

        return await this.perm_db.fetchByLevel(level);
    }

    async maxLevel(id) {
        if (!this.enabled) {
            return this._disabledLevel;
        }

        const groups = await this.fetch(id);

        if (groups === null) {
            return this.getLevels().default;
        }

        let maxLevel;

        if (Util.single(groups)) {
            maxLevel = Util.first(groups).level;
        } else {
            const levels = groups.map(group => group.level);
            maxLevel = Math.max(...levels);
        }

        return maxLevel;
    }

    async isInGroup(name, id, validate = false) {
        if (!this.enabled) {
            return false;
        } else if (validate) {
            name = this.checkName(name);
        }

        const currentPerms = await getClient().permManager.fetch(id);
        return currentPerms && currentPerms.find(group => group.name === name);
    }

    async fetchGroup(name, validate = false) {
        if (!this.enabled) {
            return DisabledGroup;
        }

        if (name === OwnerGroup.name) {
            return OwnerGroup;
        } else if (validate) {
            name = this.checkName(name);
        }

        const group = await this.perm_db.fetchGroup(name);

        if (validate && group === null) {
            throw new PermissionError("Group doesn't exist");
        } else {
            return group;
        }
    }

    async add(group, id, validate = false) {
        if (group === null) {
            throw new PermissionError("Group doesn't exist");
        }

        if (group.name === OwnerGroup.name) {
            throw new PermissionError(`Can't add a user to the "${OwnerGroup.name}" group`, group.name);
        } else if (validate) {
            this.checkName(group.name);
        }

        const user = new User({ user: id });
        await this.perm_db.add(group, user);

        getLogger().info(`Added user: ${id} to group: "${group}".`);
        return user;
    }

    async remove(group, id, validate = false) {
        if (group === null) {
            throw new PermissionError("Group doesn't exist");
        }

        if (group.name === OwnerGroup.name) {
            throw new PermissionError(`Can't remove a user from the "${OwnerGroup.name}" group`, group.name);
        } else if (validate) {
            this.checkName(group.name);
        }

        const user = new User({ user: id });

        const res = await this.perm_db.remove(group, user),
            removed = res.changes > 0;

        if (removed) {
            getLogger().info(`Removed user: ${id} from group: "${group}".`);
        } else if (validate) {
            throw new PermissionError("User wasn't a part of the provided group", {
                group,
                user: id
            });
        }

        return removed;
    }

    async removeAll(id) {
        const user = new User({ user: id });

        const res = await this.perm_db.removeAll(user),
            removed = res.changes > 0;

        getLogger().info(`Removed permissions for user: ${id}`);
        return removed;
    }

    async addGroup(name, level, validate = {}) {
        let validateNew, checkExisting;

        if (typeof validate === "boolean") {
            validateNew = checkExisting = validate;
        } else {
            validateNew = validate.validateNew ?? true;
            checkExisting = validate.checkExisting ?? true;
        }

        if (validateNew) {
            name = this.checkName(name);
            level = this.checkLevel(level, true, false);
        }

        if (checkExisting) {
            const existingGroup = await getClient().permManager.fetchGroup(name);

            if (existingGroup !== null) {
                throw new PermissionError("Group already exists", existingGroup);
            }
        }

        const group = new Group({ name, level });
        await this.perm_db.addGroup(group);

        getLogger().info(`Added group: "${name}" with level: ${level}`);
        return group;
    }

    async removeGroup(group, validate = false) {
        if (group === null) {
            throw new PermissionError("Group doesn't exist");
        }

        if (group.name === OwnerGroup.name) {
            throw new PermissionError(`Can't remove the "${OwnerGroup.name}" group`, group.name);
        } else if (validate) {
            this.checkName(group.name);
        }

        const res = await this.perm_db.removeGroup(group),
            removed = res.changes > 0;

        if (validate && !removed) {
            throw new PermissionError("Group doesn't exist", group.name);
        }

        await this.perm_db.removeByGroup(group);

        getLogger().info(`Removed group: "${group.name}"`);
        return group;
    }

    async updateGroup(group, newName, newLevel, validate = {}) {
        let validateProvided, validateNew, checkExisting;

        if (typeof validate === "boolean") {
            validateProvided = validateNew = checkExisting = validate;
        } else {
            validateProvided = validate.validateProvided ?? false;
            validateNew = validate.validateNew ?? true;
            checkExisting = validate.checkExisting ?? true;
        }

        if (group === null) {
            throw new PermissionError("Group doesn't exist");
        } else if (validateProvided) {
            this.checkName(group.name);
        }

        if (group.name === newName) {
            throw new PermissionError("Can't update group with the same name", group.name);
        } else if (group.level === newLevel) {
            throw new PermissionError("Can't update group with the same level", group.level);
        }

        let newGroup = new Group(group),
            updatedName = false;

        if (newName != null) {
            if (validateNew) {
                newName = this.checkName(newName, true, false);
            }

            if (checkExisting) {
                const existingGroup = await this.fetchGroup(newName);

                if (existingGroup !== null) {
                    throw new PermissionError("Group already exists", existingGroup);
                }
            }

            updatedName = newGroup.setName(newName);
        }

        if (newLevel != null) {
            if (validateNew) {
                newLevel = this.checkLevel(newLevel, true, false);
            }

            newGroup.setLevel(newLevel);
        }

        const res = await this.perm_db.updateGroup(group, newGroup),
            updated = res.changes > 0;

        if (updated) {
            getLogger().info(`Updated group: "${group.name}" with name: "${newName}", level: ${newLevel}`);
        } else if (validateProvided) {
            throw new PermissionError("Group doesn't exist", group.name);
        }

        if (updatedName) {
            await this.perm_db.transferUsers(group, newGroup);
            getLogger().info(`Transferred group: "${group.name}" users to: "${newName}".`);
        }

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

        if (Util.empty(groups)) {
            return null;
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
