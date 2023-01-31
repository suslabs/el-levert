import { AsyncDatabase, Modes } from "./AsyncDatabase.js";
import Util from "../util/Util.js";

const createGroupSt = `CREATE TABLE "Groups" (
	"name"	TEXT,
	"level"	INTEGER
);`,
      createUsersSt = `CREATE TABLE "Users" (
    "group"	TEXT,
    "id"	TEXT
);`;

const fetchSt = "SELECT * FROM Groups WHERE name = (SELECT \"group\" FROM Users WHERE id = $id);",
      addSt = "INSERT INTO Users VALUES ($group, $id);",
      removeSt = "DELETE FROM Users WHERE \"group\" = $group AND id = $id;",
      removeAllSt = "DELETE FROM Users WHERE id = $id;",
      removeByGroupSt = "DELETE FROM Users WHERE \"group\" = $name;",
      listSt = "SELECT * FROM Users";

const fetchGroupSt = "SELECT * FROM Groups WHERE name = $name;",
      fetchLevelSt = "SELECT * FROM Groups WHERE level = $level;",
      addGroupSt = "INSERT INTO Groups VALUES ($name, $level);",
      removeGroupSt = "DELETE FROM Groups WHERE name = $name;",
      groupListSt = "SELECT * FROM Groups";

class PermissionDatabase {
    constructor(path) {
        this.dbPath = path;
    }

    async create_db() {
        const db = new AsyncDatabase(this.dbPath, Modes.OPEN_RWCREATE);
        await db.open();

        await db.run(createGroupSt);
        await db.run(createUsersSt);

        await db.close();
    }

    async load() {
        this.db = new AsyncDatabase(this.dbPath, Modes.OPEN_READWRITE);
        await this.db.open();
    }

    async fetch(id) {
        const row = await this.db.all(fetchSt, {
            $id: id
        });

        if(typeof row === "undefined" || row.length < 1) {
            return false;
        }

        return row;
    }

    add(group, id) {
        return this.db.run(addSt, {
            $group: group,
            $id: id
        });
    }

    remove(group, id) {
        return this.db.run(removeSt, {
            $group: group,
            $id: id
        });
    }

    removeAll(id) {
        return this.db.run(removeAllSt, {
            $id: id
        });
    }

    async fetchGroup(name) {
        const row = await this.db.get(fetchGroupSt, {
            $name: name
        });
        
        if(typeof row === "undefined") {
            return false;
        }

        return row;
    }

    async fetchByLevel(level) {
        const row = await this.db.get(fetchLevelSt, {
            $level: level
        });
        
        if(typeof row === "undefined") {
            return false;
        }

        return row;
    }

    addGroup(name, level) {
        return this.db.run(addGroupSt, {
            $name: name,
            $level: level
        });
    }

    async removeGroup(name) {
        await this.db.run(removeByGroupSt, {
            $name: name
        });

        await this.db.run(removeGroupSt, {
            $name: name
        });
    }

    listUsers() {
        return this.db.all(listSt);
    }

    listGroups() {
        return this.db.all(groupListSt);
    }
}

export default PermissionDatabase;