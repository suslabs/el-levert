import RevisionDatabase from "./RevisionDatabase.js";

import Tag from "../structures/tag/Tag.js";
import TagBitField from "../structures/tag/TagBitField.js";

import Util from "../util/Util.js";
import ArrayUtil from "../util/ArrayUtil.js";
import ObjectUtil from "../util/ObjectUtil.js";
import DatabaseUtil from "../util/database/DatabaseUtil.js";

function sortTags(tags) {
    const objs = typeof Util.first(tags) !== "string";
    ArrayUtil.sort(tags, objs ? tag => tag.name : null);
}

class TagDatabase extends RevisionDatabase {
    static tagDataProps = ["aliasName", "name", "body", "bin", "owner", "args", "registered", "lastEdited", "type"];

    constructor(dbPath, queryPath, options) {
        options = ObjectUtil.guaranteeObject(options);

        const customFunctions = new Map();

        super(dbPath, queryPath, {
            ...options,
            customFunctions
        });
    }

    async exists(name) {
        return await DatabaseUtil.exists(name, this.tagQueries.exists, this.tagQueries.existsMultiple, "name");
    }

    async fetch(name) {
        const row = await this.tagQueries.fetch.get({
            $name: name
        });

        return DatabaseUtil.rowEntity(row, Tag);
    }

    async fetchAlias(name, separator = Tag._argsSeparator) {
        return await this.tagQueries.fetchAlias.all({
            $name: name,
            $separator: separator
        });
    }

    async add(tag, options) {
        options = ObjectUtil.guaranteeObject(options);

        if (options.setRegistered ?? true) {
            tag.setRegistered();
        }

        const res = await this.tagQueries.add.run({
            ...tag.getData("$", true, ["aliasName", "name", "body", "bin", "owner", "args", "registered", "type"])
        });

        if (res.changes > 0) {
            await this.usageCreate(tag.name);
        }

        return res;
    }

    async edit(tag) {
        tag.setNew();
        tag.setLastEdited();

        return await this.tagQueries.edit.run({
            ...tag.getData("$", true, ["aliasName", "name", "body", "bin", "args", "lastEdited", "type"])
        });
    }

    async updateProps(name, tag) {
        const res = await this.tagQueries.updateProps.run({
            $tagName: name,
            ...tag.getData("$", true, this.constructor.tagDataProps)
        });

        if (res.changes > 0 && name !== tag.name) {
            await this.usageRename(name, tag.name);
        }

        return res;
    }

    async chown(tag, newOwner) {
        tag.setNew();
        tag.setLastEdited();

        tag.setOwner(newOwner);

        return await this.tagQueries.chown.run({
            ...tag.getData("$", true, ["name", "owner", "lastEdited", "type"])
        });
    }

    async rename(tag, newName) {
        tag.setNew();
        tag.setLastEdited();

        const oldName = tag.name;
        tag.setName(newName);

        const res = await this.tagQueries.rename.run({
            $oldName: oldName,
            ...tag.getData("$", true, ["aliasName", "name", "lastEdited", "type"])
        });

        if (res.changes > 0) {
            await this.usageRename(oldName, newName);
        }

        return res;
    }

    async updateAliases(name, newName) {
        return await this.tagQueries.updateAliases.run({
            $name: name,
            $newName: newName
        });
    }

    async fetchAliases(name, targetExists = false) {
        const rows = await this.tagQueries.fetchAliases.all({
            $name: name,
            $targetExists: targetExists ? 1 : 0
        });

        if (Util.empty(rows)) {
            return null;
        }

        if (Util.first(rows).name === null) {
            return [];
        }

        return DatabaseUtil.rowEntity(rows, Tag);
    }

    async delete(tag) {
        return await this.tagQueries.delete.run({
            $name: tag.name
        });
    }

    async dump(flag = null) {
        const rows = await this.tagQueries.dump.all(TagBitField.query(flag));

        const tags = rows.map(row => {
            const isHidden = TagBitField.hasFlag(row.type, "hidden");
            return isHidden ? `${row.name} (hidden)` : row.name;
        });

        sortTags(tags);
        return tags;
    }

    async fullDump(flag = null) {
        const rows = await this.tagQueries.fullDump.all(TagBitField.query(flag)),
            tags = DatabaseUtil.rowEntity(rows, Tag);

        sortTags(tags);
        return tags;
    }

    async searchDump(flag = null) {
        return await this.tagQueries.searchDump.all(TagBitField.query(flag));
    }

    async random(flag = null) {
        return await this.tagQueries.random.get(TagBitField.query(flag));
    }

    async searchWithPrefix(prefix) {
        const rows = await this.tagQueries.searchWithPrefix.all({
                $prefix: `${prefix}%`
            }),
            tags = rows.map(row => row.name);

        sortTags(tags);
        return tags;
    }

    async list(user, flag = null, options = {}) {
        options = ObjectUtil.guaranteeObject(options, "limit");

        const limit = options.limit ?? -1,
            offset = options.offset ?? 0;

        const rows = await this.tagQueries.list.all({
            $user: user,
            $limit: limit,
            $offset: offset,
            ...TagBitField.query(flag)
        });

        return DatabaseUtil.rowEntity(rows, Tag);
    }

    async topUserTags(user, options = {}) {
        options = ObjectUtil.guaranteeObject(options, "limit");

        const limit = options.limit ?? 50,
            offset = options.offset ?? 0,
            onlyUsed = options.onlyUsed ? 1 : 0;

        const rows = await this.tagQueries.topUserTags.all({
            $user: user,
            $onlyUsed: onlyUsed,
            $limit: limit,
            $offset: offset
        });

        return DatabaseUtil.rowEntity(rows, Tag);
    }

    async topUserTagsTotal(user, options = {}) {
        options = ObjectUtil.guaranteeObject(options, "onlyUsed");

        const onlyUsed = options.onlyUsed ? 1 : 0;

        const row = await this.tagQueries.topUserTagsTotal.get({
            $user: user,
            $onlyUsed: onlyUsed
        });

        return row.count;
    }

    async count(user = null, flag = null) {
        if (user !== null && flag === null) {
            const cached = await this.quotaFetch(user);

            if (cached !== null) {
                return cached.count;
            }
        }

        const res = await this.tagQueries.count.get({
            $user: user,
            ...TagBitField.query(flag)
        });

        return res.count;
    }

    async quotaFetch(user) {
        const quota = await this.quotaQueries.fetch.get({
            $user: user
        });

        if (typeof quota._data === "undefined") {
            return null;
        }

        return {
            quota: quota.quota,
            count: quota.count
        };
    }

    async quotaCreate(user) {
        return await this.quotaQueries.create.run({
            $user: user
        });
    }

    async quotaSet(user, quota, count) {
        return await this.quotaQueries.set.run({
            $user: user,
            $quota: quota,
            $count: count
        });
    }

    async sizeLeaderboard(options = {}) {
        options = ObjectUtil.guaranteeObject(options, "limit");

        const limit = options.limit ?? 20,
            offset = options.offset ?? 0;

        return await this.quotaQueries.sizeLeaderboard.all({
            $limit: limit,
            $offset: offset
        });
    }

    async sizeLeaderboardTotal() {
        const row = await this.quotaQueries.sizeLeaderboardTotal.get();
        return row.count;
    }

    async countLeaderboard(options = {}) {
        options = ObjectUtil.guaranteeObject(options, "limit");

        const limit = options.limit ?? 20,
            offset = options.offset ?? 0;

        return await this.quotaQueries.countLeaderboard.all({
            $limit: limit,
            $offset: offset
        });
    }

    async countLeaderboardTotal() {
        const row = await this.quotaQueries.countLeaderboardTotal.get();
        return row.count;
    }

    async quotaUserLeaderboard(user) {
        const row = await this.quotaQueries.userLeaderboard.get({
            $user: user
        });

        if (typeof row._data === "undefined") {
            return null;
        }

        return {
            count: row.count,
            quota: row.quota,
            countPos: row.countPos,
            sizePos: row.sizePos
        };
    }

    async usageFetch(name) {
        const usage = await this.usageQueries.fetch.get({
            $name: name
        });

        if (typeof usage._data === "undefined") {
            return null;
        }

        return usage.count ?? 0;
    }

    async usageCreate(name) {
        return await this.usageQueries.create.run({
            $name: name
        });
    }

    async usageDelete(name) {
        return await this.usageQueries.delete.run({
            $name: name
        });
    }

    async usageIncrement(name) {
        return await this.usageQueries.increment.run({
            $name: name
        });
    }

    async usageRename(oldName, newName) {
        return await this.usageQueries.rename.run({
            $oldName: oldName,
            $newName: newName
        });
    }

    async usageLeaderboard(options = {}) {
        options = ObjectUtil.guaranteeObject(options, "limit");

        const limit = options.limit ?? 20,
            offset = options.offset ?? 0;

        const rows = await this.usageQueries.leaderboard.all({
            $limit: limit,
            $offset: offset
        });

        return rows.map(row => ({
            name: row.name,
            count: row.count,
            exists: Boolean(row.exists)
        }));
    }

    async usageLeaderboardTotal() {
        const row = await this.usageQueries.total.get();
        return row.count;
    }
}

export default TagDatabase;
