import { AsyncDatabase, Modes } from "../sqlite/AsyncDatabase.js";
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

const create_st = {
        tagTableCreate: `CREATE TABLE "Tags" (
        "hops"	TEXT,
        "name"	TEXT,
        "body"	TEXT,
        "owner"	TEXT,
        "args"	TEXT,
        "registered"	INTEGER,
        "lastEdited"	INTEGER,
        "type"	INTEGER
    );`,
        quotaTableCreate: `CREATE TABLE "Quotas" (
        "id"	TEXT,
        "quota"	REAL
    )`
    },
    exec_st = {
        tag_st: {
            fetch: "SELECT * FROM Tags WHERE name = $name;",
            add: "INSERT INTO Tags VALUES ($name, $name, $body, $owner, '', $registered, 0, $type);",
            edit: "UPDATE Tags SET hops = $hops, body = $body, args = $args, lastEdited = $lastEdited, type = $type WHERE name = $name;",
            chown: "UPDATE Tags SET owner = $owner, lastEdited = $lastEdited, type = $type WHERE name = $name;",
            delete: "DELETE FROM Tags WHERE name = $name;",
            dump: "SELECT name FROM Tags;",
            list: "SELECT * FROM Tags WHERE owner = $owner;"
        },
        quota_st: {
            quotaSet: "UPDATE Quotas SET quota = $quota WHERE id = $id",
            quotaCreate: "INSERT INTO Quotas VALUES ($id, 0)",
            quota: "SELECT quota FROM Quotas WHERE id = $id;"
        }
    };

class TagDatabase {
    constructor(path) {
        this.dbPath = path;
    }

    async create_db() {
        const db = new AsyncDatabase(this.dbPath, Modes.OPEN_RWCREATE);
        await db.open();

        await db.run(create_st.tagTableCreate);
        await db.run(create_st.quotaTableCreate);

        await db.close();
    }

    async load() {
        this.db = new AsyncDatabase(this.dbPath, Modes.OPEN_READWRITE);
        await this.db.open();

        for (const type in exec_st) {
            this[type] = {};

            for (const st in exec_st[type]) {
                this[type][st] = await this.db.prepare(exec_st[type][st]);
            }
        }
    }

    async fetch(name) {
        const row = await this.tag_st.fetch.get({
            $name: name
        });

        if (typeof row === "undefined" || row.length < 1) {
            return false;
        }

        return new Tag(row);
    }

    add(tag) {
        return this.tag_st.add.run({
            $name: tag.name,
            $body: tag.body,
            $owner: tag.owner,
            $registered: tag.registered,
            $type: tag.type
        });
    }

    async edit(tag) {
        tag.lastEdited = Date.now();

        const res = this.tag_st.edit.run({
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

        const res = this.tag_st.chown.run({
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
        const res = await this.tag_st.delete.run({
            $name: name
        });

        if (typeof res.changes !== "undefined" && res.changes > 0) {
            return true;
        }

        return false;
    }

    async dump() {
        let tags = await this.tag_st.dump.all();
        tags = tags.map(x => x.name);
        tags.sort();

        return tags;
    }

    async list(owner) {
        const tags = await this.tag_st.list.all({
            $owner: owner
        });

        return tags.map(x => new Tag(x));
    }

    async quotaFetch(id) {
        const quota = await this.quota_st.quota.get({
            $id: id
        });

        if (typeof quota === "undefined") {
            return false;
        }

        return quota["quota"];
    }

    quotaCreate(id) {
        return this.quota_st.quotaCreate.run({
            $id: id
        });
    }

    quotaSet(id, quota) {
        return this.quota_st.quotaSet.run({
            $id: id,
            $quota: quota
        });
    }
}

export default TagDatabase;
