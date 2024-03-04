import Database from "./Database.js";

class PermissionDatabase extends Database {
    async fetch(id) {
        const rows = await this.userQueries.fetch.all({
            $id: id
        });

        if (typeof rows === "undefined" || rows.length < 1) {
            return false;
        }

        return rows;
    }

    async add(group, id) {
        return await this.userQueries.add.run({
            $group: group,
            $id: id
        });
    }

    async remove(group, id) {
        return await this.userQueries.remove.run({
            $group: group,
            $id: id
        });
    }

    async removeAll(id) {
        return await this.userQueries.removeAll.run({
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
        const row = await this.groupQueries.fetchByLevel.get({
            $level: level
        });

        if (typeof row === "undefined") {
            return false;
        }

        return row;
    }

    async addGroup(name, level) {
        return await this.groupQueries.add.run({
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

    async listUsers() {
        return await this.userQueries.list.all();
    }

    async listGroups() {
        return await this.groupQueries.list.all();
    }
}

export default PermissionDatabase;
