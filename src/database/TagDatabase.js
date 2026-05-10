import SqlDatabase from "./SqlDatabase.js";

import Tag from "../structures/tag/Tag.js";

import Util from "../util/Util.js";
import ArrayUtil from "../util/ArrayUtil.js";

function sortTags(tags) {
    const objs = typeof Util.first(tags) !== "string";
    ArrayUtil.sort(tags, objs ? tag => tag.name : null);
}

class TagDatabase extends SqlDatabase {
    async _loadQueries() {
        await this._detectAliasColumn();
        await this._readQueries();
        this._rewriteAliasQueries();
        await this._bindQueries();
    }

    async exists(name) {
        if (Array.isArray(name)) {
            if (Util.empty(name)) {
                return [];
            }

            const rows = await this.tagQueries.existsMultiple.all({
                    $names: JSON.stringify(name)
                }),
                existing = new Set(rows.map(row => row.name));

            return name.map(tagName => existing.has(tagName));
        } else {
            const row = await this.tagQueries.exists.get({
                $name: name
            });

            return typeof row._data !== "undefined";
        }
    }

    async fetch(name) {
        const row = await this.tagQueries.fetch.get({
            $name: name
        });

        if (typeof row._data === "undefined") {
            return null;
        }

        return new Tag(row);
    }

    async add(tag) {
        tag.setRegistered();

        const res = await this.tagQueries.add.run({
            ...tag.getData("$", true, ["aliasName", "name", "body", "owner", "args", "registered", "type"])
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
            ...tag.getData("$", true, ["aliasName", "name", "body", "args", "lastEdited", "type"])
        });
    }

    async updateProps(name, tag) {
        const res = await this.tagQueries.updateProps.run({
            $tagName: name,
            ...tag.getData("$")
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

    async delete(tag) {
        return await this.tagQueries.delete.run({
            $name: tag.name
        });
    }

    async dump(flag = null) {
        const rows = await this.tagQueries.dump.all({
                $flag: flag
            }),
            tags = rows.map(row => row.name);

        sortTags(tags);
        return tags;
    }

    async fullDump(flag = null) {
        const rows = await this.tagQueries.fullDump.all({
                $flag: flag
            }),
            tags = rows.map(row => new Tag(row));

        sortTags(tags);
        return tags;
    }

    async searchWithPrefix(prefix) {
        const rows = await this.tagQueries.searchWithPrefix.all({
                $prefix: `${prefix}%`
            }),
            tags = rows.map(row => row.name);

        sortTags(tags);
        return tags;
    }

    async list(user) {
        const rows = await this.tagQueries.list.all({
                $user: user
            }),
            tags = rows.map(row => new Tag(row));

        sortTags(tags);
        return tags;
    }

    async count(user = null, flag = null) {
        if (user !== null && flag === null) {
            const cached = await this.quotaCountFetch(user);

            if (cached !== null) {
                return cached;
            }
        }

        const res = await this.tagQueries.count.get({
            $user: user,
            $flag: flag
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

        return quota.quota;
    }

    async quotaCreate(user) {
        return await this.quotaQueries.create.run({
            $user: user
        });
    }

    async quotaSet(user, quota) {
        return await this.quotaQueries.set.run({
            $user: user,
            $quota: quota
        });
    }

    async quotaCountFetch(user) {
        const count = await this.quotaQueries.countFetch.get({
            $user: user
        });

        if (typeof count._data === "undefined") {
            return null;
        }

        return count.count;
    }

    async quotaCountSet(user, count) {
        return await this.quotaQueries.countSet.run({
            $user: user,
            $count: count
        });
    }

    async sizeLeaderboard(limit) {
        const rows = await this.quotaQueries.sizeLeaderboard.all({
            $limit: limit
        });

        return Array.from(rows);
    }

    async countLeaderboard(limit) {
        const rows = await this.quotaQueries.countLeaderboard.all({
            $limit: limit
        });

        return Array.from(rows);
    }

    async usageFetch(name) {
        const usage = await this.usageQueries.fetch.get({
            $name: name
        });

        if (typeof usage._data === "undefined") {
            return null;
        }

        return usage.count;
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

    async usageLeaderboard(limit) {
        const rows = await this.usageQueries.leaderboard.all({
            $limit: limit
        });

        return Array.from(rows);
    }

    async _detectAliasColumn() {
        const rows = await this.db.all("PRAGMA table_info(Tags);"),
            columns = Array.from(rows).map(row => row.name);

        this._aliasColumn = columns.includes("aliasName") || !columns.includes("hops") ? "aliasName" : "hops";
    }

    _rewriteAliasQueries() {
        const legacyQueries = this.queryStrings.legacyQueries;

        if (this._aliasColumn !== "hops") {
            delete this.queryStrings.legacyQueries;
            return;
        }

        const tagQueries = this.queryStrings.tagQueries;

        for (const [name, query] of Object.entries(tagQueries)) {
            tagQueries[name] = query.replaceAll(/(?<!\$)\baliasName\b/g, "hops");
        }

        tagQueries.updateAliases = legacyQueries.updateAliases;
        delete this.queryStrings.legacyQueries;
    }
}

export default TagDatabase;
