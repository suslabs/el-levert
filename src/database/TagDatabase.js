import Database from "./SqlDatabase.js";

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
        tag.registered = Date.now();

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

    async list(user) {
        const rows = await this.tagQueries.list.all({
            $user: user
        });

        return rows.map(row => new Tag(row));
    }

    async quotaFetch(user) {
        const quota = await this.quotaQueries.fetch.get({
            $user: user
        });

        if (typeof quota === "undefined") {
            return false;
        }

        return quota["quota"];
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
}

export default TagDatabase;
