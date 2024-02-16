import { AsyncDatabase, Modes } from "./AsyncDatabase.js";

const create_st = {
        createGroupTable: `CREATE TABLE "Groups" (
        "name"	TEXT,
        "level"	INTEGER
    );`,
        createUserTable: `CREATE TABLE "Users" (
        "group"	TEXT,
        "id"	TEXT
    );`
    },
    exec_st = {
        user_st: {
            fetch: 'SELECT * FROM Groups WHERE name = (SELECT "group" FROM Users WHERE id = $id);',
            add: "INSERT INTO Users VALUES ($group, $id);",
            remove: 'DELETE FROM Users WHERE "group" = $group AND id = $id;',
            removeAll: "DELETE FROM Users WHERE id = $id;",
            removeByGroup: 'DELETE FROM Users WHERE "group" = $name;',
            list: "SELECT * FROM Users"
        },
        group_st: {
            fetch: "SELECT * FROM Groups WHERE name = $name;",
            fetchLevel: "SELECT * FROM Groups WHERE level = $level;",
            add: "INSERT INTO Groups VALUES ($name, $level);",
            remove: "DELETE FROM Groups WHERE name = $name;",
            list: "SELECT * FROM Groups"
        }
    };

class PermissionDatabase {
    constructor(path) {
        this.dbPath = path;
    }

    async create_db() {
        const db = new AsyncDatabase(this.dbPath, Modes.OPEN_RWCREATE);
        await db.open();

        await db.run(create_st.createGroupTable);
        await db.run(create_st.createUserTable);

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

    async fetch(id) {
        const rows = await this.user_st.fetch.all({
            $id: id
        });

        if (typeof rows === "undefined" || rows.length < 1) {
            return false;
        }

        return rows;
    }

    add(group, id) {
        return this.user_st.add.run({
            $group: group,
            $id: id
        });
    }

    remove(group, id) {
        return this.user_st.remove.run({
            $group: group,
            $id: id
        });
    }

    removeAll(id) {
        return this.user_st.removeAll.run({
            $id: id
        });
    }

    async fetchGroup(name) {
        const row = await this.group_st.fetch.get({
            $name: name
        });

        if (typeof row === "undefined") {
            return false;
        }

        return row;
    }

    async fetchByLevel(level) {
        const row = await this.group_st.fetchLevel.get({
            $level: level
        });

        if (typeof row === "undefined") {
            return false;
        }

        return row;
    }

    addGroup(name, level) {
        return this.group_st.add.run({
            $name: name,
            $level: level
        });
    }

    async removeGroup(name) {
        await this.user_st.removeByGroup.run({
            $name: name
        });

        await this.group_st.remove.run({
            $name: name
        });
    }

    listUsers() {
        return this.user_st.list.all();
    }

    listGroups() {
        return this.group_st.list.all();
    }
}

export default PermissionDatabase;
