import path from "node:path";
import fs from "node:fs/promises";

import TagDatabase from "../../src/database/TagDatabase.js";

import createLogger from "../../src/logger/createLogger.js";
import getDefaultLoggerConfig from "../../src/logger/DefaultLoggerConfig.js";

import config from "../../config/config.json" assert { type: "json" };
import Util from "../../src/util/Util.js";

class DBImporter {
    constructor(jsonPath) {
        this.jsonPath = jsonPath;

        const loggerConfig = getDefaultLoggerConfig("Importer", true, false, config.importLogFile);
        this.logger = createLogger(loggerConfig);
    }

    async loadDatabase() {
        const dbPath = path.join(config.dbPath, "tag_db.db"),
            queryPath = path.join(config.queryPath, "tag");

        this.tag_db = new TagDatabase(dbPath, queryPath);

        try {
            await fs.access(dbPath);
        } catch (err) {
            this.logger.info("Tag database not found. Creating at path " + dbPath);

            await fs.mkdir(config.dbPath, {
                recursive: true
            });

            await this.tag_db.create_db();
        }

        await this.tag_db.load();

        this.logger.info("Successfully loaded database.");
    }

    async addRegular(tag, quota) {
        quota += Util.getUtf8ByteLength(tag.body) / 1024;

        if (quota > config.maxQuota) {
            this.logger.info("Cannot add tag: " + tag.name);

            return false;
        }

        await this.tag_db.quotaSet(tag.owner, quota);

        await this.tag_db.add(tag);

        this.logger.info("Added tag: " + tag.name);
    }

    async addAlias(tag, quota) {
        if (tag.args.length > 0) {
            quota += Util.getUtf8ByteLength(tag.args) / 1024;

            if (quota > config.maxQuota) {
                this.logger.info("Cannot add tag: " + tag.name);

                return false;
            }

            await this.tag_db.quotaSet(tag.owner, quota);
        }

        await this.tag_db.add(tag);
        await this.tag_db.edit(tag);

        this.logger.info("Added alias: " + tag.name);
    }

    async editRegular(tag, find, quota) {
        let t_quota = Util.getUtf8ByteLength(tag.body) / 1024 - Util.getUtf8ByteLength(find.body) / 1024;

        if (find.args.length > 0) {
            t_quota -= Util.getUtf8ByteLength(find.args);
        }

        quota += t_quota;

        if (quota > config.maxQuota) {
            this.logger.info("Cannot edit tag: " + tag.name);

            return false;
        }

        await this.tag_db.quotaSet(tag.owner, quota);

        await this.tag_db.edit(tag);

        this.logger.info("Edited tag: " + tag.name);
    }

    async editAlias(tag, find, quota) {
        this.logger.warn("Didn't edit alias " + tag.name);
    }

    async importTag(tag) {
        tag = {
            hops: tag.hops,
            name: tag.hops[0],
            body: tag.body ?? "",
            owner: tag.owner ?? "0",
            args: tag.args ?? "",
            registered: 0,
            lastEdited: 0
        };

        const find = await this.tag_db.fetch(tag.name),
            [isScript, body] = Util.parseScript(tag.body);

        tag.body = body;
        tag.args = tag.args.split(" ")[0];
        tag.type = isScript << 1;

        let quota = await this.tag_db.quotaFetch(tag.owner);

        if (quota === false) {
            await this.tag_db.quotaCreate(tag.owner);
            quota = 0;

            this.logger.info("Created new quota: " + tag.owner);
        }

        if (!find) {
            if (tag.hops.length > 1) {
                return this.addAlias(tag, quota);
            }

            return this.addRegular(tag, quota);
        } else if ((find.type & 1) === 0) {
            if (tag.hops.length > 1 && tag.hops !== find.hops) {
                return this.editAlias(tag, find, quota);
            }

            if (find.body !== tag.body) {
                return this.editRegular(tag, find, quota);
            }
        }
    }

    async deleteTag(tag) {
        let quota = await this.tag_db.quotaFetch(tag.owner);
        quota -= Util.getUtf8ByteLength(tag.body ?? "") / 1024;

        await this.tag_db.quotaSet(tag.owner, quota);

        await this.tag_db.delete(tag.name);

        this.logger.info("Deleted tag: " + tag.name);
    }

    async loadJson() {
        try {
            await fs.access(this.jsonPath);
        } catch (err) {
            this.logger.error("Error occured while loading json.", err);

            return false;
        }

        const raw = await fs.readFile(this.jsonPath);

        try {
            return JSON.parse(raw);
        } catch (err) {
            this.logger.error("Failed parsing json.", err);

            return false;
        }
    }

    async updateDatabase() {
        const json = await this.loadJson();

        if (!json) {
            this.logger.error("Failed updating database.");

            return false;
        }

        const currTags = await this.tag_db.dump();

        if (currTags.length > 0) {
            const jsonNames = json.map(x => x.name),
                diff = currTags.filter(x => !jsonNames.includes(x));

            for (let i = 0; i < diff.length; i++) {
                const tag = await this.tag_db.fetch(diff[i]);

                if ((tag.type & 1) === 0) {
                    await this.deleteTag(tag);
                }
            }
        }

        for (let i = 0; i < json.length; i++) {
            await this.importTag(json[i]);
        }
    }

    async purge1() {
        const currTags = await this.tag_db.dump();

        for (let i = 0; i < currTags.length; i++) {
            const tag = await this.tag_db.fetch(currTags[i]);

            if ((tag.type & 1) === 0) {
                await this.deleteTag(tag);
            }
        }
    }
}

export default DBImporter;
