import { AsyncDatabase, Modes } from "./AsyncDatabase.js";
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

const createSt = `CREATE TABLE "Tags" (
    "hops"	TEXT,
    "name"	TEXT,
    "body"	TEXT,
    "owner"	TEXT,
    "args"	TEXT,
    "registered"	INTEGER,
    "lastEdited"	INTEGER,
    "type"	INTEGER
);`,
     qTableCreateSt = `CREATE TABLE "Quotas" (
    "id"	TEXT,
    "quota"	REAL
)`;

const fetchSt = "SELECT * FROM Tags WHERE name = $name;",
      addSt = "INSERT INTO Tags VALUES ($name, $name, $body, $owner, '', $registered, 0, $type);",
      editSt = "UPDATE Tags SET hops = $hops, body = $body, args = $args, lastEdited = $lastEdited, type = $type WHERE name = $name;",
      chownSt = "UPDATE Tags SET owner = $owner, lastEdited = $lastEdited, type = $type WHERE name = $name;",
      deleteSt = "DELETE FROM Tags WHERE name = $name;",
      dumpSt = "SELECT name FROM Tags;",
      listSt = "SELECT * FROM Tags WHERE owner = $owner;";

const quotaSetSt = "UPDATE Quotas SET quota = $quota WHERE id = $id",
      quotaCreateSt = "INSERT INTO Quotas VALUES ($id, 0)",
      quotaSt = "SELECT quota FROM Quotas WHERE id = $id;";

class TagDatabase {
    constructor(path) {
        this.dbPath = path;
    }

    async create_db() {
        const db = new AsyncDatabase(this.dbPath, Modes.OPEN_RWCREATE);
        await db.open();

        await db.run(createSt);
        await db.run(qTableCreateSt);

        await db.close();
    }

    async load() {
        this.db = new AsyncDatabase(this.dbPath, Modes.OPEN_READWRITE);
        await this.db.open();
    }

    async fetch(name) {
        const row = await this.db.get(fetchSt, {
            $name: name
        });
        
        if(typeof row === "undefined" || row.length < 1) {
            return false;
        }

        return new Tag(row);
    }

    add(tag) {
        return this.db.run(addSt, {
            $name: tag.name,
            $body: tag.body,
            $owner: tag.owner,
            $registered: tag.registered,
            $type: tag.type
        });
    }

    async edit(tag) {
        tag.lastEdited = Date.now();

        const res = this.db.run(editSt, {
            $hops: tag.hops.join(","),
            $name: tag.name,
            $body: tag.body,
            $args: tag.args,
            $lastEdited: tag.lastEdited,
            $type: tag.type
        });

        if(typeof res.changes !== "undefined" && res.changes > 0) {
            return true;
        }

        return false;
    }

    async chown(tag, owner) {
        tag.lastEdited = Date.now();
        tag.owner = owner;

        const res = this.db.run(chownSt, {
            $name: tag.name,
            $owner: tag.owner,
            $lastEdited: tag.lastEdited,
            $type: tag.type | 1
        });

        if(typeof res.changes !== "undefined" && res.changes > 0) {
            return true;
        }

        return false;
    }

    async delete(name) {
        const res = await this.db.run(deleteSt, {
            $name: name
        });

        if(typeof res.changes !== "undefined" && res.changes > 0) {
            return true;
        }

        return false;
    }

    async dump() {
        let tags = await this.db.all(dumpSt);
        tags = tags.map(x => x.name);
        tags.sort();

        return tags;
    }

    async list(owner) {
        const tags = await this.db.all(listSt, {
            $owner: owner
        });

        return tags.map(x => new Tag(x));
    }

    async quotaFetch(id) {
        const quota = await this.db.get(quotaSt, {
            $id: id
        });

        if(typeof quota === "undefined") {
            return false;
        }

        return quota["quota"];
    }

    quotaCreate(id) {
        return this.db.run(quotaCreateSt, {
            $id: id
        });
    }

    quotaSet(id, quota) {
        return this.db.run(quotaSetSt, {
            $id: id,
            $quota: quota
        });
    }
}

export default TagDatabase;