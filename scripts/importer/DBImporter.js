import JsonLoader from "../../src/loaders/JsonLoader.js";

import TagManager from "../../src/managers/database/TagManager.js";

import Tag from "./mock/FakeTag.js";
import { TagTypes } from "../../src/structures/tag/TagTypes.js";

import DBUpdateModes from "./DBUpdateModes.js";
import TagDifferenceType from "./TagDifferenceType.js";

import Util from "../../src/util/Util.js";
import TypeTester from "../../src/util/TypeTester.js";
import ArrayUtil from "../../src/util/ArrayUtil.js";
import ParserUtil from "../../src/util/commands/ParserUtil.js";

import TagCommand from "../../src/commands/tag/tag.js";

import ImporterError from "../../src/errors/ImporterError.js";

class DBImporter {
    static getDifference(currentTags, importTags, diffTypes = TagDifferenceType.all) {
        if (diffTypes === TagDifferenceType.all) {
            diffTypes = Object.values(TagDifferenceType).pop();
        } else {
            diffTypes = ArrayUtil.guaranteeArray(diffTypes);

            if (!diffTypes.every(type => Object.values(TagDifferenceType).includes(type))) {
                throw new ImporterError("Invalid diff types", diffTypes);
            }
        }

        const hasExisting = diffTypes.includes(TagDifferenceType.existing),
            hasNew = diffTypes.includes(TagDifferenceType.new),
            hasDeleted = diffTypes.includes(TagDifferenceType.deleted);

        const diff = {};

        const importNames = importTags.map(tag => tag.name),
            importNamesSet = new Set(importNames);

        let oldTags, oldNames;

        if (hasExisting || hasDeleted) {
            oldTags = currentTags.filter(tag => tag.isOld);
            oldNames = oldTags.map(tag => tag.name);

            diff.oldTags = oldTags;
        }

        if (hasExisting) {
            diff.existingTags = oldNames.filter(name => importNamesSet.has(name));
        }

        if (hasNew) {
            const currentNamesSet = new Set(currentTags.map(tag => tag.name));
            diff.newTags = importNames.filter(name => !currentNamesSet.has(name));
        }

        if (hasDeleted) {
            diff.deletedTags = oldNames.filter(name => !importNamesSet.has(name));
        }

        return diff;
    }

    constructor(tagManager, logger) {
        this.logger = logger;
        this.tagManager = tagManager;
    }

    async updateDatabase(path, mode = DBUpdateModes.overwrite) {
        if (typeof mode !== "string" || Util.empty(mode)) {
            throw new ImporterError("No update mode provided");
        } else if (!Object.values(DBUpdateModes).includes(mode)) {
            throw new ImporterError("Invalid update mode: " + mode, mode);
        }

        let importTags = await this._loadTags(path),
            currentTags = await this.tagManager.dump(true);

        let diffTypes = [];
        let existingTags, newTags, deletedTags;

        switch (mode) {
            case DBUpdateModes.overwrite:
                diffTypes = TagDifferenceType.all;
                this.logger.warn("Overwriting existing tags...");
                break;
            case DBUpdateModes.amend:
                diffTypes = [TagDifferenceType.existing, TagDifferenceType.new];
                this.logger.warn("Amending existing tags...");
                break;
        }

        ({
            existingTags,
            newTags,
            deletedTags,
            oldTags: currentTags
        } = DBImporter.getDifference(currentTags, importTags, diffTypes));

        importTags = TagManager.getNameMap(importTags);
        currentTags = TagManager.getNameMap(currentTags);

        Tag._fetchFinished = true;

        let count = 0;

        switch (mode) {
            case DBUpdateModes.overwrite:
                count += await this._deleteTags(deletedTags, currentTags);
            // eslint-disable-next-line no-fallthrough
            case DBUpdateModes.amend:
                count += await this._updateTags(existingTags, importTags, currentTags);
                count += await this._addTags(newTags, importTags, currentTags);
                break;
        }

        this.logger.info(count > 0 ? `Updated ${count} tag(s).` : "No tags were updated successfully.");
    }

    async fix() {
        //

        await this._fixQuotas();

        await this.tagManager.tag_db.db.vacuum();
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
                this.logger.error(`Error occured while deleting "${tag.name}":`, err);
            }
        }

        this.logger.info(`Finished purging ${count} old tags.`);
        return true;
    }

    static _requiredTagProps = {
        hops: Array,
        name: "string",
        body: "string"
    };

    static _parseTag(data) {
        const { body, isScript } = ParserUtil.parseScript(data.body),
            type = isScript ? TagTypes.defaultScriptType : TagTypes.textType;

        const tag = new Tag({
            ...data,
            body,
            type
        });

        return tag;
    }

    _validTag(data) {
        if (!TypeTester.validateProps(data, DBImporter._requiredTagProps)) {
            return false;
        }

        const alias = Util.multiple(data.hops);

        if (!alias && Util.empty(data.body)) {
            return false;
        }

        let name = alias ? Util.first(data.hops) : data.name,
            err;
        [name, err] = this.tagManager.checkName(name, false);

        if (err !== null || TagCommand.subcommands.includes(name)) {
            return false;
        }

        data.name = name;
        return true;
    }

    async _loadTags(path) {
        const loader = new JsonLoader("tags", path, this.logger);

        let [data] = await loader.load();
        data = data.filter(data => this._validTag(data));
        data = ArrayUtil.unique(data, "name");

        let tags;

        {
            const oldDefault = TagTypes.defaultVersion;
            TagTypes.defaultVersion = TagTypes.versionTypes[0];

            tags = data.map(tag => DBImporter._parseTag(tag));

            TagTypes.defaultVersion = oldDefault;
        }

        this.tags = tags;
        return tags;
    }

    async _updateTags(existingTags, importTags, currentTags) {
        let count = 0;

        for (const name of existingTags) {
            const currTag = currentTags.get(name),
                importTag = importTags.get(name);

            if (!currTag.equals(importTag)) {
                try {
                    await this.tagManager.updateProps(currTag, importTag);
                    count++;
                } catch (err) {
                    this.logger.error(`Error occured while updating "${name}":`, err);
                }
            }
        }

        return count;
    }

    async _addTags(newTags, importTags, currentTags) {
        let count = 0;

        for (const name of newTags) {
            const currentTag = currentTags.get(name),
                importTag = importTags.get(name);

            if (typeof currentTag === "undefined") {
                try {
                    await this.tagManager._addPrepared(importTag);
                    count++;
                } catch (err) {
                    this.logger.error(`Error occured while adding "${name}":`.err);
                }
            }
        }

        return count;
    }

    async _deleteTags(deletedTags, currentTags) {
        let count = 0;

        for (const name of deletedTags) {
            const oldTag = currentTags.get(name);

            try {
                await this.tagManager.delete(oldTag);
                count++;
            } catch (err) {
                this.logger.error(`Error occured while deleting "${name}":`, err);
            }
        }

        return count;
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
