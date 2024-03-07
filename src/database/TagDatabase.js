import Database from "./Database.js";

import Tag from "../structures/tag/Tag.js";

/*
{
    $hops: tag.getHopsString(),
    $name: tag.name,
    $body: tag.body,
    $owner: tag.owner,
    $args: tag.args,
    $registered: tag.registered,
    $lastEdited: tag.lastEdited,
    $type: tag.type
}
*/

class TagDatabase extends Database {
    async fetch(name) {
        const row = await this.tagQueries.fetch.get({
            $name: name
        });

        if (typeof row === "undefined" || row.length < 1) {
            return false;
        }

        return new Tag(row);
    }

    async add(tag) {
        return await this.tagQueries.add.run({
            $name: tag.name,
            $body: tag.body,
            $owner: tag.owner,
            $registered: tag.registered,
            $type: tag.type
        });
    }

    async edit(tag) {
        tag.lastEdited = Date.now();

        const res = this.tagQueries.edit.run({
            $hops: tag.getHopsString(),
            $name: tag.name,
            $body: tag.body,
            $args: tag.args,
            $lastEdited: tag.lastEdited,
            $type: tag.type
        });

        if (typeof res.changes !== "undefined" && res.changes > 0) {
            return true;
        }

        return false;
    }

    async chown(tag, newOwner) {
        tag.lastEdited = Date.now();
        tag.owner = newOwner;

        const res = this.tagQueries.chown.run({
            $name: tag.name,
            $owner: tag.owner,
            $lastEdited: tag.lastEdited,
            $type: tag.type | 1
        });

        if (typeof res.changes !== "undefined" && res.changes > 0) {
            return true;
        }

        return false;
    }

    async delete(tag) {
        const res = await this.tagQueries.delete.run({
            $name: tag.name
        });

        if (typeof res.changes !== "undefined" && res.changes > 0) {
            return true;
        }

        return false;
    }

    async dump() {
        let tags = await this.tagQueries.dump.all();
        tags = tags.map(tag => tag.name);
        tags.sort();

        return tags;
    }

    async list(owner) {
        const rows = await this.tagQueries.list.all({
            $owner: owner
        });

        return rows.map(row => new Tag(row));
    }

    async quotaFetch(id) {
        const quota = await this.quotaQueries.quota.get({
            $id: id
        });

        if (typeof quota === "undefined") {
            return false;
        }

        return quota["quota"];
    }

    async quotaCreate(id) {
        return await this.quotaQueries.quotaCreate.run({
            $id: id
        });
    }

    async quotaSet(id, quota) {
        return await this.quotaQueries.quotaSet.run({
            $id: id,
            $quota: quota
        });
    }
}

export default TagDatabase;
