import JsonLoader from "../../src/loaders/JsonLoader.js";

import TagManager from "../../src/managers/database/TagManager.js";

import Tag from "./mock/FakeTag.js";
import { TagTypes } from "../../src/structures/tag/TagTypes.js";

import DBUpdateModes from "./DBUpdateModes.js";
import TagDifferenceType from "./TagDifferenceType.js";
import OpenModes from "../../src/database/drivers/sqlite/OpenModes.js";

import Util from "../../src/util/Util.js";
import TypeTester from "../../src/util/TypeTester.js";
import ArrayUtil from "../../src/util/ArrayUtil.js";
import ParserUtil from "../../src/util/commands/ParserUtil.js";

import TagCommand from "../../src/commands/tag/tag.js";

import ImporterError from "../../src/errors/ImporterError.js";

class DBImporter {
    static getDifference(currentTags, importTags, diffTypes = TagDifferenceType.all) {
        if (diffTypes === TagDifferenceType.all) {
            diffTypes = Object.values(TagDifferenceType);
            diffTypes.pop();
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

        const importNames = importTags.map(tag => tag.name);

        let oldTags, oldNames;

        if (hasExisting || hasDeleted) {
            oldTags = currentTags.filter(tag => tag.isOld);
            oldNames = oldTags.map(tag => tag.name);

            diff.oldTags = oldTags;
        }

        let importVsOld;

        if (hasExisting || hasDeleted) {
            importVsOld = ArrayUtil.diff(oldNames, importNames);
        }

        if (hasExisting) {
            diff.existingTags = importVsOld.shared;
        }

        if (hasNew) {
            const currentNames = currentTags.map(tag => tag.name),
                importVsCurrent = ArrayUtil.diff(currentNames, importNames);

            diff.newTags = importVsCurrent.added;
        }

        if (hasDeleted) {
            diff.deletedTags = importVsOld.removed;
        }

        return diff;
    }

    constructor(tagManager, logger) {
        this.logger = logger;
        this.tagManager = tagManager;
    }

    async updateDatabase(path, mode = DBUpdateModes.overwrite) {
        path = typeof path === "string" ? path.trim() : "";

        if (Util.empty(path)) {
            throw new ImporterError("No import path provided");
        } else if (!Util.nonemptyString(mode)) {
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
        await this._fixQuotas();
        await this._fixUsage();

        await this.tagManager.tag_db.close();
        await this.tagManager.tag_db.open(OpenModes.OPEN_READWRITE);
        await this.tagManager.tag_db.db.vacuum();
        await this.tagManager.tag_db._loadQueries();
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
            await this.tagManager
                .delete(tag)
                .then(() => count++)
                .catch(err => this.logger.error(`Error occured while deleting "${tag.name}":`, err));
        }

        this.logger.info(`Finished purging ${count} old tags.`);
        return true;
    }

    static _requiredTagProps = {
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

        if (typeof data.aliasName !== "string" && !Array.isArray(data.hops)) {
            return false;
        }

        const aliasName = data.aliasName || data.hops?.[1] || "",
            alias = Util.nonemptyString(aliasName);

        if (!alias && Util.empty(data.body)) {
            return false;
        }

        let name = data.hops?.[0] ?? data.name,
            err;
        [name, err] = this.tagManager.checkName(name, false);

        const subcommands = TagCommand.info?.subcommands ?? [];

        if (err !== null || subcommands.includes(name)) {
            return false;
        }

        data.name = name;
        data.aliasName = aliasName;
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
                await this.tagManager
                    .updateProps(currTag, importTag)
                    .then(() => count++)
                    .catch(err => this.logger.error(`Error occured while updating "${name}":`, err));
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
                await this.tagManager
                    ._addPrepared(importTag)
                    .then(() => count++)
                    .catch(err => this.logger.error(`Error occured while adding "${name}":`, err));
            }
        }

        return count;
    }

    async _deleteTags(deletedTags, currentTags) {
        let count = 0;

        for (const name of deletedTags) {
            const oldTag = currentTags.get(name);

            await this.tagManager
                .delete(oldTag)
                .then(() => count++)
                .catch(err => this.logger.error(`Error occured while deleting "${name}":`, err));
        }

        return count;
    }

    async _fixQuotas() {
        const tags = await this.tagManager.dump(true),
            sizes = tags.reduce((acc, tag) => {
                acc[tag.owner] ??= {
                    quota: 0,
                    count: 0
                };

                acc[tag.owner].quota += tag.getSize();
                acc[tag.owner].count++;
                return acc;
            }, {});

        await this.tagManager.tag_db.db.run("DELETE FROM Quotas WHERE 1=1;");

        let count = 0;

        for (const [user, stats] of Object.entries(sizes)) {
            if (stats.count <= 0) {
                continue;
            }

            await this.tagManager.tag_db.db
                .run("INSERT INTO Quotas (user, quota, count) VALUES ($user, $quota, $count);", {
                    $user: user,
                    $quota: stats.quota,
                    $count: stats.count
                })
                .then(() => count++)
                .catch(err => this.logger.error(`Error recalculating quota for user ${user}:`, err));
        }

        this.logger.info(`Recalculated quota for ${count} users.`);
    }

    async _fixUsage() {
        const res = await this.tagManager.tag_db.db.run("DELETE FROM Usage WHERE count <= 0;");

        this.logger.info(`Pruned ${res.changes ?? 0} usage row(s).`);
    }
}

export default DBImporter;
