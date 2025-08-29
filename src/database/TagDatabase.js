import SqlDatabase from "./SqlDatabase.js";

import Tag from "../structures/tag/Tag.js";

import Util from "../util/Util.js";
import ArrayUtil from "../util/ArrayUtil.js";

function sortTags(tags) {
    const objs = typeof Util.first(tags) !== "string";
    ArrayUtil.sort(tags, objs ? tag => tag.name : null);
}

class TagDatabase extends SqlDatabase {
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
            $hops: tag.getHopsString(),
            $name: tag.name,
            $body: tag.body,
            $owner: tag.owner,
            $args: tag.args,
            $registered: tag.registered,
            $type: tag.type
        });
    }

    async edit(tag) {
        tag.setNew();
        tag.setLastEdited();

        return await this.tagQueries.edit.run({
            $hops: tag.getHopsString(),
            $name: tag.name,
            $body: tag.body,
            $args: tag.args,
            $lastEdited: tag.lastEdited,
            $type: tag.type
        });
    }

    async updateProps(name, tag) {
        return await this.tagQueries.updateProps.run({
            $tagName: name,
            $hops: tag.getHopsString(),
            $name: tag.name,
            $body: tag.body,
            $owner: tag.owner,
            $args: tag.args,
            $registered: tag.registered,
            $lastEdited: tag.lastEdited,
            $type: tag.type
        });
    }

    async chown(tag, newOwner) {
        tag.setNew();
        tag.setLastEdited();

        tag.setOwner(newOwner);

        return await this.tagQueries.chown.run({
            $name: tag.name,
            $owner: tag.owner,
            $lastEdited: tag.lastEdited,
            $type: tag.type
        });
    }

    async rename(tag, newName) {
        tag.setNew();
        tag.setLastEdited();

        const oldName = tag.name;
        tag.setName(newName);

        return await this.tagQueries.rename.run({
            $oldName: oldName,
            $hops: tag.getHopsString(),
            $name: tag.name,
            $lastEdited: tag.lastEdited,
            $type: tag.type
        });
    }

    async updateHops(name, newName, sep) {
        return await this.tagQueries.updateHops.run({
            $name: name,
            $newName: newName,
            $sep: sep
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
}

export default TagDatabase;
