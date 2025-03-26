import JsonLoader from "../../src/loaders/JsonLoader.js";

import Tag from "./mock/FakeTag.js";
import { TagTypes } from "../../src/structures/tag/TagTypes.js";

import Util from "../../src/util/Util.js";

class DBImporter {
    constructor(tagManager, logger) {
        this.logger = logger;
        this.tagManager = tagManager;
    }

    async updateDatabase(path) {
        let importTags = await this._loadTags(path),
            currTags = await this.tagManager.dump(true);

        let existingTags, newTags, deletedTags;
        ({ existingTags, newTags, deletedTags, oldTags: currTags } = DBImporter._getDifference(importTags, currTags));

        importTags = DBImporter._getMap(importTags);
        currTags = DBImporter._getMap(currTags);

        Tag.fetchFinished = true;
        let count = 0;

        for (const name of existingTags) {
            const currTag = currTags.get(name),
                importTag = importTags.get(name);

            if (!currTag.isEqual(importTag)) {
                try {
                    await this.tagManager.updateProps(currTag, importTag);
                    count++;
                } catch (err) {
                    this.logger.error(err);
                }
            }
        }

        for (const name of newTags) {
            const currTag = currTags.get(name),
                importTag = importTags.get(name);

            if (typeof currTag === "undefined") {
                try {
                    await this.tagManager._add(importTag);
                    count++;
                } catch (err) {
                    this.logger.error(err);
                }
            }
        }

        for (const name of deletedTags) {
            const oldTag = currTags.get(name);

            try {
                await this.tagManager.delete(oldTag);
                count++;
            } catch (err) {
                this.logger.error(err);
            }
        }

        Tag.fetchFinished = false;

        if (count > 0) {
            this.logger.info(`Updated ${count} tags.`);
        } else {
            this.logger.info("No tags were updated.");
        }
    }

    async fix() {
        //

        await this._fixQuotas();

        await this.tagManager.tag_db.db.run("VACUUM;");
    }

    async purgeOld() {
        const tags = await this.tagManager.dump(true),
            oldTags = tags.filter(tag => tag.isOld);

        if (Util.empty(oldTags)) {
            this.logger.info("No old tags to purge.");
            return false;
        }

        let count = 0;

        for (const tag of oldTags) {
            try {
                await this.tagManager.delete(tag);
                count++;
            } catch (err) {
                this.logger.error(err);
            }
        }

        this.logger.info(`Finished purging ${count} old tags.`);
        return true;
    }

    static _parseTag(data) {
        const name = Util.first(data.hops);

        const [isScript, body] = Util.parseScript(data.body),
            type = isScript ? TagTypes.defaultScriptType : TagTypes.textType;

        const tag = new Tag({
            ...data,
            name,
            body,
            type
        });

        return tag;
    }

    static _getDifference(importTags, currTags) {
        const importNames = importTags.map(tag => tag.name),
            importNamesSet = new Set(importNames);

        const currNamesSet = new Set(currTags.map(tag => tag.name));

        const oldTags = currTags.filter(tag => tag.isOld),
            oldNames = oldTags.map(tag => tag.name);

        return {
            existingTags: oldNames.filter(name => importNamesSet.has(name)),
            newTags: importNames.filter(name => !currNamesSet.has(name)),
            deletedTags: oldNames.filter(name => !importNamesSet.has(name)),
            oldTags
        };
    }

    static _getMap(tags) {
        return new Map(tags.map(tag => [tag.name, tag]));
    }

    async _loadTags(path) {
        const loader = new JsonLoader("tags", path, this.logger);

        let [data] = await loader.load();
        data = data.filter(
            tag => [tag.name, tag.body].every(prop => typeof prop === "string") && Array.isArray(tag.hops)
        );
        data = data.filter(tag => !this.tagManager.checkName(Util.first(tag.hops)));

        const oldDefault = TagTypes.defaultVersion;
        TagTypes.defaultVersion = TagTypes.versionTypes[0];

        let tags = data.map(tag => DBImporter._parseTag(tag));
        tags = tags.filter(tag => tag.isAlias || !Util.empty(tag.body));
        tags = Util.unique(tags, "name");

        TagTypes.defaultVersion = oldDefault;

        this.tags = tags;
        return tags;
    }

    async _fixQuotas() {
        const tags = await this.tagManager.dump(true),
            sizes = tags.reduce((acc, tag) => {
                acc[tag.owner] = (acc[tag.owner] || 0) + tag.getSize();
                return acc;
            }, {});

        await this.tagManager.tag_db.db.run("DELETE FROM Quotas WHERE 1=1;");

        let count = 0;

        for (const [user, quota] of Object.entries(sizes)) {
            if (quota === 0) {
                continue;
            }

            try {
                await this.tagManager.tag_db.db.run("INSERT INTO Quotas VALUES ($user, $quota);", {
                    $user: user,
                    $quota: quota
                });

                count++;
            } catch (err) {
                this.logger.error(err);
            }
        }

        this.logger.info(`Recalculated quota for ${count} users.`);
    }
}

export default DBImporter;
