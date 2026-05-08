import SqlDatabase from "./SqlDatabase.js";

import Tag from "../structures/tag/Tag.js";

import Util from "../util/Util.js";
import ArrayUtil from "../util/ArrayUtil.js";

function sortTags(tags) {
    const objs = typeof Util.first(tags) !== "string";
    ArrayUtil.sort(tags, objs ? tag => tag.name : null);
}

class TagDatabase extends SqlDatabase {
    static legacyUpdateAliasesSql =
        "UPDATE Tags SET hops = $newName " +
        "WHERE hops = $name OR hops = name || ',' || $name OR hops LIKE name || ',' || $name || ',%';";

    async _loadQueries() {
        await this._detectAliasColumn();
        await this._readQueries();
        this._rewriteAliasQueries();
        await this._bindQueries();
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

        return await this.tagQueries.add.run({
            ...tag.getData("$", true, ["aliasName", "name", "body", "owner", "args", "registered", "type"])
        });
    }

    async edit(tag) {
        tag.setNew();
        tag.setLastEdited();

        return await this.tagQueries.edit.run({
            ...tag.getData("$", true, ["aliasName", "name", "body", "args", "lastEdited", "type"])
        });
    }

    async updateProps(name, tag) {
        return await this.tagQueries.updateProps.run({
            $tagName: name,
            ...tag.getData("$")
        });
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

        return await this.tagQueries.rename.run({
            $oldName: oldName,
            ...tag.getData("$", true, ["aliasName", "name", "lastEdited", "type"])
        });
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
        const res = await this.tagQueries.count.get({
            $user: user,
            $flag: flag
        });

        return res.count;
    }

    async countLeaderboard(limit) {
        const rows = await this.tagQueries.countLeaderboard.all({
            $limit: limit
        });

        return Array.from(rows);
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

    async sizeLeaderboard(limit) {
        const rows = await this.quotaQueries.sizeLeaderboard.all({
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
        if (this._aliasColumn !== "hops") {
            return;
        }

        const tagQueries = this.queryStrings.tagQueries;

        for (const [name, query] of Object.entries(tagQueries)) {
            tagQueries[name] = query.replaceAll(/(?<!\$)\baliasName\b/g, "hops");
        }

        tagQueries.updateAliases = this.constructor.legacyUpdateAliasesSql;
    }
}

export default TagDatabase;
