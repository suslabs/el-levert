import BaseDatabase from "../sqlite/BaseDatabase.js";

import Tag from "./Tag.js";

/*
{
    $hops: tag.hops.join(","),
    $name: tag.name,
    $body: tag.body,
    $owner: tag.owner,
    $args: tag.args,
    $registered: tag.registered,
    $lastEdited: tag.lastEdited,
    $type: tag.type
}
*/

class TagDatabase extends BaseDatabase {
    async fetch(name) {
        const row = await this.tagQueries.fetch.get({
            $name: name
        });

        if (typeof row === "undefined" || row.length < 1) {
            return false;
        }

        return new Tag(row);
    }

    add(tag) {
        return this.tagQueries.add.run({
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
            $hops: tag.hops.join(","),
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

    async chown(tag, owner) {
        tag.lastEdited = Date.now();
        tag.owner = owner;

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

    async delete(name) {
        const res = await this.tagQueries.delete.run({
            $name: name
        });

        if (typeof res.changes !== "undefined" && res.changes > 0) {
            return true;
        }

        return false;
    }

    async dump() {
        let tags = await this.tagQueries.dump.all();
        tags = tags.map(x => x.name);
        tags.sort();

        return tags;
    }

    async list(owner) {
        const tags = await this.tagQueries.list.all({
            $owner: owner
        });

        return tags.map(x => new Tag(x));
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

    quotaCreate(id) {
        return this.quotaQueries.quotaCreate.run({
            $id: id
        });
    }

    quotaSet(id, quota) {
        return this.quotaQueries.quotaSet.run({
            $id: id,
            $quota: quota
        });
    }
}

export default TagDatabase;
