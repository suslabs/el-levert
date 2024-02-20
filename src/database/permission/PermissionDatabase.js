import BaseDatabase from "../BaseDatabase.js";

class PermissionDatabase extends BaseDatabase {
    async fetch(id) {
        const rows = await this.userQueries.fetch.all({
            $id: id
        });

        if (typeof rows === "undefined" || rows.length < 1) {
            return false;
        }

        return rows;
    }

    add(group, id) {
        return this.userQueries.add.run({
            $group: group,
            $id: id
        });
    }

    remove(group, id) {
        return this.userQueries.remove.run({
            $group: group,
            $id: id
        });
    }

    removeAll(id) {
        return this.userQueries.removeAll.run({
            $id: id
        });
    }

    async fetchGroup(name) {
        const row = await this.groupQueries.fetch.get({
            $name: name
        });

        if (typeof row === "undefined") {
            return false;
        }

        return row;
    }

    async fetchByLevel(level) {
        const row = await this.groupQueries.fetchLevel.get({
            $level: level
        });

        if (typeof row === "undefined") {
            return false;
        }

        return row;
    }

    addGroup(name, level) {
        return this.groupQueries.add.run({
            $name: name,
            $level: level
        });
    }

    async removeGroup(name) {
        await this.userQueries.removeByGroup.run({
            $name: name
        });

        await this.groupQueries.remove.run({
            $name: name
        });
    }

    listUsers() {
        return this.userQueries.list.all();
    }

    listGroups() {
        return this.groupQueries.list.all();
    }
}

export default PermissionDatabase;
