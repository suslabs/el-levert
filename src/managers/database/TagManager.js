import path from "node:path";

import DBManager from "./DBManager.js";
import TagRevisionManager from "./revision/TagRevisionManager.js";
import TagDatabase from "../../database/TagDatabase.js";

import Tag from "../../structures/tag/Tag.js";
import FakeTagRegistry from "./FakeTagRegistry.js";

import TagVM from "../../vm/isolated-vm/TagVM.js";
import TagVM2 from "../../vm/vm2/TagVM2.js";

import { TagTypes } from "../../structures/tag/TagTypes.js";
import { RevisionOperationTypes } from "../../structures/revision/RevisionOperationTypes.js";
import { fileContentTypes, scriptContentTypes, binaryContentTypes, binaryExtensions } from "./TagContentTypes.js";

import { getClient, getConfig, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import RegexUtil from "../../util/misc/RegexUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import LoggerUtil from "../../util/LoggerUtil.js";
import diceSearch from "../../util/search/diceSearch.js";
import uFuzzySearch from "../../util/search/uFuzzySearch.js";

import TagError from "../../errors/TagError.js";

class TagManager extends DBManager {
    static $name = "tagManager";
    static loadPriority = 0;

    static getNameMap(tags) {
        return new Map(tags.map(tag => [tag.name, tag]));
    }

    constructor(enabled) {
        super(enabled, "tag", "tag_db", TagDatabase);

        this.maxTagSize = getConfig().maxTagSize;
        this.maxQuota = getConfig().maxQuota ?? this.maxTagSize.text + this.maxTagSize.script + this.maxTagSize.binary;
        this.maxTagCount = getConfig().maxTagCount;

        this.maxTagNameLength = getConfig().maxTagNameLength;
        this.tagNameRegex = new RegExp(getConfig().tagNameRegex);

        this.revisions = new TagRevisionManager(this);
    }

    isTagName(name) {
        this.tagNameRegex.lastIndex = 0;
        return this.tagNameRegex.test(name);
    }

    checkName(name, throwErrors = true) {
        let msg, ref;
        name = String(name ?? "").trim();

        if (Util.empty(name)) {
            msg = "Invalid tag name";
        } else if (name.length > this.maxTagNameLength) {
            msg = `The tag name can be at most ${this.maxTagNameLength} characters long`;
            ref = {
                nameLength: name.length,
                maxLength: this.maxTagNameLength
            };
        } else if (!this.isTagName(name)) {
            msg = "The tag name must consist of Latin characters, numbers, _ or -";
        }

        const errored = typeof msg !== "undefined";

        if (throwErrors) {
            return errored
                ? (() => {
                      throw new TagError(msg, ref);
                  })()
                : name;
        } else {
            return errored ? [null, msg] : [name, null];
        }
    }

    checkBody(body, throwErrors = true, isBinary = false) {
        let msg, ref;

        if (isBinary) {
            if (!ArrayBuffer.isView(body) || body.byteLength === 0) {
                msg = "Tag body is empty";
            }
        } else {
            body = String(body ?? "").trim();

            if (Util.empty(body)) {
                msg = "Tag body is empty";
            }
        }

        const errored = typeof msg !== "undefined";

        if (throwErrors) {
            return errored
                ? (() => {
                      throw new TagError(msg, ref);
                  })()
                : body;
        } else {
            return errored ? [null, msg] : [body, null];
        }
    }

    async exists(name, validate = false) {
        if (Array.isArray(name)) {
            if (validate) {
                name = name.map(tagName => this.checkName(tagName));
            }

            if (Util.empty(name)) {
                return [];
            }

            const dbExists = await this.tag_db.exists(name);
            return name.map((tagName, i) => FakeTagRegistry.has(tagName) || dbExists[i]);
        } else if (validate) {
            name = this.checkName(name);
        }

        if (FakeTagRegistry.has(name)) {
            return true;
        }

        return await this.tag_db.exists(name);
    }

    async fetch(name, validate = false) {
        if (validate) {
            this.checkName(name);
        }

        if (FakeTagRegistry.has(name)) {
            return FakeTagRegistry.fetch(name);
        }

        const tag = await this.tag_db.fetch(name);

        return validate && tag === null
            ? (() => {
                  throw new TagError("Tag doesn't exist", name);
              })()
            : tag;
    }

    async fetchAlias(tag, options = true) {
        options = typeof options === "boolean" ? { aliasOriginal: options } : ObjectUtil.guaranteeObject(options);

        const aliasOriginal = options.aliasOriginal ?? true;

        tag = Tag.from(tag, true);

        if (tag === null) {
            throw new TagError("Tag doesn't exist");
        } else if (!tag.isAlias || tag._fetched) {
            return tag;
        }

        if (FakeTagRegistry.has(tag.aliasName)) {
            const fakeTag = FakeTagRegistry.fetch(tag.aliasName),
                hops = [tag.name, fakeTag.name];

            fakeTag._setAliasProps(hops, tag.args ?? "", aliasOriginal);
            fakeTag._usageName = Util.nonemptyString(tag.args) ? tag.name : fakeTag.name;

            if (aliasOriginal) {
                fakeTag._setOriginalProps(tag);
            }

            return fakeTag;
        }

        const rows = await this.tag_db.fetchAlias(tag.aliasName, Tag._argsSeparator);

        if (Util.empty(rows)) {
            throw new TagError("Hop not found", tag.aliasName);
        }

        let usageName = Util.nonemptyString(tag.args) ? tag.name : null,
            hops = [tag.name];

        for (const row of rows) {
            const hop = row.name;

            if (hops.includes(hop)) {
                throw new TagError("Tag recursion detected", hops.concat(hop));
            }

            hops.push(hop);

            if (usageName === null && (row.aliasName === null || Util.nonemptyString(row.args))) {
                usageName = hop;
            }
        }

        const lastRow = Util.last(rows);

        if (lastRow.aliasName !== null) {
            if (hops.includes(lastRow.aliasName)) {
                throw new TagError("Tag recursion detected", hops.concat(lastRow.aliasName));
            }

            if (FakeTagRegistry.has(lastRow.aliasName)) {
                const fakeTag = FakeTagRegistry.fetch(lastRow.aliasName);
                hops.push(fakeTag.name);

                const collectedArgs = [tag.args, lastRow.collectedArgs]
                    .filter(arg => Util.nonemptyString(arg))
                    .join(Tag._argsSeparator);

                fakeTag._setAliasProps(hops, collectedArgs, aliasOriginal);
                fakeTag._usageName = usageName ?? fakeTag.name;

                if (aliasOriginal) {
                    fakeTag._setOriginalProps(tag);
                }

                return fakeTag;
            }

            throw new TagError("Hop not found", lastRow.aliasName);
        }

        const lastTag = new Tag(lastRow);

        const collectedArgs = [tag.args, lastRow.collectedArgs]
            .filter(arg => Util.nonemptyString(arg))
            .join(Tag._argsSeparator);

        lastTag._setAliasProps(hops, collectedArgs, aliasOriginal);
        lastTag._usageName = usageName;

        if (aliasOriginal) {
            lastTag._setOriginalProps(tag);
        }

        return lastTag;
    }

    async execute(tag, args, values, options) {
        tag = Tag.from(tag, true);

        values = ObjectUtil.guaranteeObject(values);
        options = ObjectUtil.guaranteeObject(options);

        tag = await this.fetchAlias(tag);

        if (tag.isBinary) {
            throw new TagError("Tag is a binary tag and the content cannot be displayed");
        }

        const usageName = tag._usageName ?? tag.name;

        if (!FakeTagRegistry.has(usageName)) {
            await this._incrementUsage(usageName);
        }

        if (tag.isFake) {
            return await FakeTagRegistry.execute(tag, args, values, options);
        }

        const type = tag.getScriptType();

        if (type === TagTypes.defaults.type) {
            return tag.body;
        }

        if (!TagTypes.types.validScript.has(type)) {
            throw new TagError("Invalid tag type", type);
        }

        return await this._runScriptTag(tag, type, args, values, options);
    }

    async add(name, body, owner, meta, validate, options) {
        meta = Tag.normalizeMeta(meta);
        options = ObjectUtil.guaranteeObject(options);

        const isBinary = meta.type === "binary";

        validate = ObjectUtil.getBooleanOptions(
            validate,
            {
                validateNew: false,
                checkExisting: true
            },
            {
                validateNew: true,
                checkExisting: true
            }
        );

        if (validate.validateNew) {
            name = this.checkName(name);
            body = this.checkBody(body, true, isBinary);
        }

        if (validate.checkExisting) {
            if (FakeTagRegistry.has(name)) {
                throw new TagError("Cannot manipulate command", name);
            }

            const existingTag = await this.fetch(name);

            if (existingTag !== null) {
                throw new TagError("Tag already exists", existingTag);
            }
        }

        const tag = new Tag({ name, body, owner, meta });

        await this.tag_db.transactionImmediate(async tx => {
            await this._addPrepared(tag, tx, this._getRevisionOptions(options, owner));
        });

        return tag;
    }

    async edit(tag, body, meta, validate, options) {
        tag = Tag.from(tag, true);
        options = ObjectUtil.guaranteeObject(options);

        validate = ObjectUtil.getBooleanOptions(validate, false, {
            validateProvided: false,
            validateNew: true,
            checkExisting: true
        });

        if (tag === null) {
            throw new TagError("Tag doesn't exist");
        } else if (tag.isFake) {
            throw new TagError("Cannot edit tag", tag.name);
        } else if (validate.validateProvided) {
            this.checkName(tag.name);
        }

        meta = Tag.normalizeMeta(meta);

        const isBinary = meta.type === "binary";

        if (validate.validateNew) {
            body = this.checkBody(body, true, isBinary);
        }

        const newTag = new Tag({
            name: tag.name,
            owner: tag.owner,
            body,
            meta
        });

        this._checkTagSize(newTag);

        if (validate.checkExisting && tag.equivalent(newTag)) {
            throw new TagError("Can't update tag with the same body", tag);
        }

        await this.tag_db.transactionImmediate(async tx => {
            const res = await tx.edit(newTag),
                updated = res.changes > 0;

            if (updated) {
                getLogger().info(
                    `Edited tag: "${tag.name}" with type: ${newTag.getScriptType()}, body:${LoggerUtil.formatLog(body)}`
                );
            } else if (validate.validateProvided) {
                throw new TagError("Tag doesn't exist", tag.name);
            }

            if (updated) {
                const sizeDiff = newTag.getSize() - tag.getSize();
                await this._updateQuota(tag.owner, sizeDiff, 0, tx);
                await this.revisions.recordUpdate(tag, newTag, tx, this._getRevisionOptions(options, tag.owner));
            }
        });

        return newTag;
    }

    async updateProps(name, tag, validate, options) {
        name = TypeTester.isObject(name) ? Tag.from(name) : name;
        tag = Tag.from(tag);
        options = ObjectUtil.guaranteeObject(options);

        validate = ObjectUtil.getBooleanOptions(validate, false, {
            validateProvided: false,
            validateNew: true,
            checkExisting: true
        });

        let oldTag = null;

        if (name instanceof Tag) {
            oldTag = name;
            name = oldTag.name;

            if (validate.validateProvided) {
                this.checkName(name);
            }
        } else {
            if (validate.validateProvided) {
                this.checkName(name);
            }

            oldTag = await this.fetch(name);

            if (oldTag === null) {
                throw new TagError("Tag doesn't exist", name);
            }
        }

        if (validate.validateNew) {
            this.checkName(tag.name);
            this.checkBody(tag.body, true, tag.isBinary);
        }

        this._checkTagSize(tag);

        if (validate.checkExisting && name !== tag.name) {
            const existingTag = await this.fetch(tag.name);

            if (existingTag !== null) {
                throw new TagError("Tag already exists", existingTag);
            }
        }

        await this.tag_db.transactionImmediate(async tx => {
            if (oldTag.owner !== tag.owner) {
                await this._updateQuota(tag.owner, 0, 0, tx);
            }

            const res = await tx.updateProps(name, tag),
                updated = res.changes > 0;

            if (updated) {
                getLogger().info(`Updated tag: "${oldTag.name}" with data:${LoggerUtil.formatLog(tag.getData())}`);
            } else if (validate.validateProvided) {
                throw new TagError("Tag doesn't exist", name);
            }

            if (updated && (!validate.validateNew || !oldTag.sameBody(tag) || oldTag.owner !== tag.owner)) {
                const oldSize = oldTag.getSize(),
                    newSize = tag.getSize();

                if (oldTag.owner === tag.owner) {
                    await this._updateQuota(tag.owner, newSize - oldSize, 0, tx);
                } else {
                    await this._updateQuota(oldTag.owner, -oldSize, -1, tx);
                    await this._updateQuota(tag.owner, newSize, 1, tx);
                }
            }

            if (updated) {
                await this.revisions.recordUpdate(oldTag, tag, tx, this._getRevisionOptions(options, oldTag.owner));
            }
        });

        return tag;
    }

    async alias(tag, aliasTag, args, createOptions, validate, options) {
        tag = Tag.from(tag, true);
        aliasTag = Tag.from(aliasTag, true);
        createOptions ??= null;
        options = ObjectUtil.guaranteeObject(options);

        validate = ObjectUtil.getBooleanOptions(validate, false, {
            validateProvided: false,
            validateNew: true,
            checkExisting: false
        });

        if (aliasTag === null) {
            throw new TagError("Alias target doesn't exist");
        } else if (validate.validateProvided) {
            this.checkName(aliasTag.name);
        }

        let validateAliasName = false;
        let create, name, owner;

        if (tag === null) {
            if (!TypeTester.isObject(createOptions)) {
                throw new TagError("No info for creating the tag provided");
            }

            validateAliasName = validate.validateNew;

            ({ name, owner } = createOptions);
            create = true;
        } else {
            validateAliasName = validate.validateProvided;

            ({ name, owner } = tag);
            create = false;
        }

        if (validateAliasName) {
            this.checkName(name);
        }

        const newTag = new Tag({ name, owner });
        newTag.aliasTo(aliasTag, args?.trim());

        let sizeDiff = newTag.getSize();

        await this.tag_db.transactionImmediate(async tx => {
            if (create) {
                if (validate.checkExisting) {
                    const existingTag = await tx.fetch(newTag.name);

                    if (existingTag !== null) {
                        throw new TagError("Tag already exists", existingTag);
                    }
                }

                await this._updateQuota(newTag.owner, 0, 0, tx);
                await tx.add(newTag);
                await this.revisions.recordCreate(newTag, tx, this._getRevisionOptions(options, newTag.owner));
                getLogger().info(`Created tag: "${newTag.name}" and aliased to: "${aliasTag.name}".`);
            } else {
                if (tag.equals(newTag)) {
                    throw new TagError("Can't alias tag with the same target and args");
                }

                sizeDiff -= tag.getSize();

                const res = await tx.edit(newTag),
                    updated = res.changes > 0;

                if (updated) {
                    getLogger().info(`Aliased tag: "${newTag.name}" to: "${aliasTag.name}".`);
                } else if (validate.validateProvided) {
                    throw new TagError("Tag doesn't exist", tag.name);
                }

                if (updated) {
                    await this.revisions.recordUpdate(tag, newTag, tx, this._getRevisionOptions(options, tag.owner));
                }
            }

            await this._updateQuota(newTag.owner, sizeDiff, create ? 1 : 0, tx);
        });

        return [newTag, create];
    }

    async chown(tag, newOwner, validate = false, options) {
        tag = Tag.from(tag, true);
        options = ObjectUtil.guaranteeObject(options);

        if (tag === null) {
            throw new TagError("Tag doesn't exist");
        } else if (tag.isFake) {
            throw new TagError("Cannot transfer ownership of tag", tag.name);
        } else if (validate) {
            this.checkName(tag.name);
        }

        const oldTag = this._cloneTag(tag),
            oldOwner = tag.owner,
            tagSize = tag.getSize();

        await this.tag_db.transactionImmediate(async tx => {
            if (oldOwner !== newOwner) {
                await this._updateQuota(newOwner, 0, 0, tx);
            }

            const res = await tx.chown(tag, newOwner),
                updated = res.changes > 0;

            if (updated) {
                getLogger().info(`Transferred tag: "${tag.name}" to: ${newOwner}`);
            } else if (validate) {
                throw new TagError("Tag doesn't exist", tag.name);
            }

            if (updated && oldOwner !== newOwner) {
                await this._updateQuota(oldOwner, -tagSize, -1, tx);
                await this._updateQuota(newOwner, tagSize, 1, tx);
            }

            if (updated) {
                await this.revisions.recordUpdate(oldTag, tag, tx, this._getRevisionOptions(options, oldOwner));
            }
        });

        return tag;
    }

    async rename(tag, newName, validate, options) {
        tag = Tag.from(tag, true);
        options = ObjectUtil.guaranteeObject(options);

        validate = ObjectUtil.getBooleanOptions(validate, false, {
            validateProvided: false,
            validateNew: true,
            checkExisting: true
        });

        const oldName = tag?.name;

        if (tag === null) {
            throw new TagError("Tag doesn't exist");
        } else if (tag.isFake) {
            throw new TagError("Cannot rename tag", tag.name);
        } else if (validate.validateProvided) {
            this.checkName(oldName);
        }

        if (validate.validateNew) {
            this.checkName(newName);
        }

        if (validate.checkExisting && oldName === newName) {
            throw new TagError("Can't update tag with the same name", tag);
        }

        if (validate.checkExisting) {
            const existingTag = await this.fetch(newName);

            if (existingTag !== null) {
                throw new TagError("Tag already exists", existingTag);
            }
        }

        await this.tag_db.transactionImmediate(async tx => {
            const oldTag = this._cloneTag(tag),
                aliasesBefore = await tx.fetchAliases(oldName);

            const res = await tx.rename(tag, newName),
                updated = res.changes > 0;

            if (updated) {
                await tx.updateAliases(oldName, newName);

                const aliasesAfter = await tx.fetchAliases(newName),
                    aliasesByName = this.constructor.getNameMap(aliasesBefore),
                    revisionOptions = this._getRevisionOptions(options, oldTag.owner);

                await this.revisions.recordUpdate(oldTag, tag, tx, revisionOptions);

                for (const aliasAfter of aliasesAfter) {
                    const aliasBefore = aliasesByName.get(aliasAfter.name);

                    if (aliasBefore != null) {
                        await this.revisions.recordUpdate(aliasBefore, aliasAfter, tx, revisionOptions);
                    }
                }

                getLogger().info(`Renamed tag: "${oldName}" to: "${newName}"`);
            } else if (validate.validateProvided) {
                throw new TagError("Tag doesn't exist", tag.name);
            }
        });

        return tag;
    }

    async delete(tag, validate = false, options) {
        tag = Tag.from(tag, true);
        options = ObjectUtil.guaranteeObject(options);

        if (tag === null) {
            throw new TagError("Tag doesn't exist");
        } else if (tag.isFake) {
            throw new TagError("Cannot delete tag", tag.name);
        } else if (validate) {
            this.checkName(tag.name);
        }

        const tagSize = tag.getSize();

        await this.tag_db.transactionImmediate(async tx => {
            const res = await tx.delete(tag),
                updated = res.changes > 0;

            if (updated) {
                getLogger().info(`Deleted tag: "${tag.name}".`);
            } else if (validate) {
                throw new TagError("Tag doesn't exist", tag.name);
            }

            if (updated) {
                await this._updateQuota(tag.owner, -tagSize, -1, tx);
                await this.revisions.recordDelete(tag, tx, this._getRevisionOptions(options, tag.owner));
            }
        });

        return tag;
    }

    async hide(tag, validate = false, options) {
        tag = Tag.from(tag, true);
        options = ObjectUtil.guaranteeObject(options);

        if (tag === null) {
            throw new TagError("Tag doesn't exist");
        } else if (tag.isFake) {
            throw new TagError("Cannot edit tag", tag.name);
        } else if (validate) {
            this.checkName(tag.name);
        }

        if (tag.isHidden) {
            throw new TagError("Tag is already hidden", tag.name);
        }

        const oldTag = this._cloneTag(tag);
        tag.setHidden();
        tag.setLastEdited();

        await this.tag_db.transactionImmediate(async tx => {
            const res = await tx.edit(tag),
                updated = res.changes > 0;

            if (updated) {
                getLogger().info(`Hid tag: "${tag.name}".`);
            } else if (validate) {
                throw new TagError("Tag doesn't exist", tag.name);
            }

            if (updated) {
                await this.revisions.recordUpdate(oldTag, tag, tx, this._getRevisionOptions(options, tag.owner));
            }
        });

        return tag;
    }

    async unhide(tag, validate = false, options) {
        tag = Tag.from(tag, true);
        options = ObjectUtil.guaranteeObject(options);

        if (tag === null) {
            throw new TagError("Tag doesn't exist");
        } else if (tag.isFake) {
            throw new TagError("Cannot edit tag", tag.name);
        } else if (validate) {
            this.checkName(tag.name);
        }

        if (tag.isBinary) {
            throw new TagError("Binary tags cannot be unhidden", tag.name);
        }

        if (!tag.isHidden) {
            throw new TagError("Tag is not hidden", tag.name);
        }

        const oldTag = this._cloneTag(tag);
        tag.unsetHidden();
        tag.setLastEdited();

        await this.tag_db.transactionImmediate(async tx => {
            const res = await tx.edit(tag),
                updated = res.changes > 0;

            if (updated) {
                getLogger().info(`Unhid tag: "${tag.name}".`);
            } else if (validate) {
                throw new TagError("Tag doesn't exist", tag.name);
            }

            if (updated) {
                await this.revisions.recordUpdate(oldTag, tag, tx, this._getRevisionOptions(options, tag.owner));
            }
        });

        return tag;
    }

    async audit(options) {
        options = ObjectUtil.guaranteeObject(options);
        return await this.revisions.list(options);
    }

    async auditDetail(id, tagName) {
        return await this.revisions.getDetail(id, tagName);
    }

    async clearAudit(options) {
        return await this.tag_db.transactionImmediate(async tx => {
            const result = await this.revisions.clear(options, tx);
            return result.changes;
        });
    }

    async revert(name, revisionId, actor, options) {
        if (!this.revisions.enabled) {
            throw new TagError("Tag revisions are disabled");
        }

        options = ObjectUtil.guaranteeObject(options);

        const mod = options.mod ?? false;

        name = this.checkName(name);

        return await this.tag_db.transactionImmediate(async tx => {
            const subject = await this.revisions.findSubject(name, tx);

            if (subject === null) {
                throw new TagError("Tag revision history doesn't exist", name);
            }

            const latest = await this.revisions.fetchLatest(subject, tx);

            if (latest === null) {
                throw new TagError("Tag revision history doesn't exist", name);
            }

            let target;

            if (revisionId == null) {
                target = latest;
            } else {
                target = await this.revisions.fetchRevisionByIndex(subject, revisionId, tx);

                if (target === null) {
                    target = await this.revisions.fetchRevision(revisionId, tx);
                }
            }

            if (target === null || target.subjectId !== subject.id) {
                throw new TagError("Revision doesn't exist", revisionId);
            } else if (!mod && target.id !== latest.id) {
                throw new TagError("Only moderators can revert to a specific revision");
            }

            const previous = revisionId == null ? await this.revisions.fetchPrevious(target, tx) : target,
                restored = this._getRevertedTag(subject, target, previous, tx),
                reverted = await this.revisions.countRevertsOf(target, tx);

            if (!mod) {
                if (reverted > 0) {
                    throw new TagError("This tag edit has already been reverted");
                }

                this.revisions.validateUserRevert(actor, subject, latest, previous, restored);
            }

            const current = await tx.fetch(subject.key.name),
                applied = await this._applyRevert(current, restored, tx);

            if (Util.empty(applied.changed)) {
                throw new TagError("Tag is already in the requested state", name);
            }

            const revisionOptions = this._getRevisionOptions(
                {
                    ...options,
                    revertOf: target.id,
                    restores: restored === null ? null : (previous?.id ?? target.id)
                },
                actor
            );

            await this.revisions.recordRevert(subject, restored, applied.changed, tx, revisionOptions);

            for (const aliasUpdate of applied.aliasUpdates) {
                await this.revisions.recordUpdate(aliasUpdate.before, aliasUpdate.after, tx, revisionOptions);
            }

            if (restored !== null) {
                restored._targetRevision = target;
                restored._currentTag = current;
                restored._previousRevision = previous;
            }

            getLogger().info(
                `Reverted tag: "${name}" to revision: ${previous?.subjectIndex ?? target.subjectIndex ?? target.id}`
            );
            return restored;
        });
    }

    async dump(full = false, flags) {
        const bitFlag = Tag.getFlag(flags),
            flag = bitFlag.isEmpty() ? null : bitFlag;

        if (full) {
            return await this.tag_db.fullDump(flag);
        } else {
            return await this.tag_db.dump(flag);
        }
    }

    async list(user) {
        const tags = await this.tag_db.list(user),
            [newTags, oldTags] = ArrayUtil.split(tags, tag => tag.isOld);

        return {
            count: tags.length,
            newTags,
            oldTags
        };
    }

    async count(user, flags) {
        if (!Util.nonemptyString(user)) {
            user = null;
        }

        const flag = Tag.getFlag(flags);
        return await this.tag_db.count(user, flag.isEmpty() ? null : flag);
    }

    async search(query, maxResults = 20, minDist, validate = false) {
        if (validate) {
            this.checkName(query);
        }

        const tags = await this.dump(false, [false, "hidden"]);

        return diceSearch(tags, query, {
            maxResults,
            minDist
        });
    }

    async fullSearch(query, maxResults = 20) {
        let tags = await this.dump(true, [false, "script", "hidden"]);

        tags = tags
            .filter(tag => !tag.isAlias)
            .map(tag => ({
                name: tag.name,
                body: tag.body
            }));

        const res = uFuzzySearch(tags, query, {
            searchKey: "body",
            maxResults
        });

        return res.other.hasInfo ? res : (res.results.forEach(x => (x.body = "")), res);
    }

    async random(prefix, validate = false) {
        if (!Util.nonemptyString(prefix)) {
            const tags = await this.dump();
            return Util.randomElement(tags) ?? null;
        } else if (validate) {
            this.checkName(prefix);
        }

        const exp = new RegExp(`^${RegexUtil.escapeRegex(prefix)}\\d+?$`);

        let tags = await this.tag_db.searchWithPrefix(prefix);
        tags = tags.filter(tag => exp.test(tag));

        return Util.randomElement(tags) ?? null;
    }

    async leaderboard(type, limit = 20) {
        const defaultUser = { username: "NOT FOUND" };

        if (!Number.isInteger(limit) || limit < 1) {
            throw new TagError("Invalid leaderboard limit", limit);
        }

        let leaderboard = [];

        switch (type) {
            case "count":
                leaderboard = await this.tag_db.countLeaderboard(limit);
                break;
            case "size":
                leaderboard = await this.tag_db.sizeLeaderboard(limit);
                break;
            case "usage":
                leaderboard = await this.tag_db.usageLeaderboard(limit);

                break;
            default:
                throw new TagError("Invalid leaderboard type: " + type, type);
        }

        switch (type) {
            case "count":
            case "size":
                await Promise.all(
                    leaderboard.map(entry =>
                        getClient()
                            .findUserById(entry.user)
                            .catch(_ => null)
                            .then(user => (entry.user = user ?? defaultUser))
                    )
                );
                break;
            case "usage":
                const names = leaderboard.map(entry => entry.name),
                    exists = await this.exists(names);

                leaderboard.forEach((entry, idx) => (entry.exists = exists[idx]));
        }

        return leaderboard;
    }

    async getQuota(user) {
        return await this.tag_db.quotaSizeFetch(user);
    }

    async downloadBody(t_args, msg, type) {
        let name;

        switch (type) {
            case "tag":
                name = "tag";
                break;
            case "eval":
                name = "script";
                break;
            default:
                throw new TagError("Invalid body type:" + type, type);
        }

        const attach = msg.file ?? msg.attachments?.at(0);

        let isFile = true,
            isScript = false,
            isBinary = false;

        let body;

        if (attach == null && !Util.nonemptyString(msg.fileUrl)) {
            isFile = false;
        } else {
            const contentType = (attach?.contentType ?? "").split(";")[0].trim().toLowerCase(),
                url = msg.fileUrl ?? attach?.url;

            const attachInfo = msg.attachInfo ?? DiscordUtil.parseAttachmentUrl(url ?? ""),
                ext = (attachInfo?.ext ?? (attach?.name ? path.extname(attach.name) : "")).toLowerCase();

            isBinary = type === "tag" && binaryContentTypes.includes(contentType) && binaryExtensions.includes(ext);
            isScript = Util.hasPrefix(scriptContentTypes, contentType);

            const maxSize = this._getMaxTagSize(isBinary, isScript);

            try {
                const res = await DiscordUtil.fetchAttachment(msg, isBinary ? "arraybuffer" : "text", {
                    allowedContentTypes: fileContentTypes,
                    maxSize
                });

                body = isBinary ? new Uint8Array(res.body) : res.body;
            } catch (err) {
                if (Util.hasPrefix(["Message doesn't have", "Invalid content type"], err.message)) {
                    isFile = false;
                } else if (err.message?.startsWith("The attachment can take up at most")) {
                    const typeLabel = isBinary ? "Binary tag" : isScript ? "Script" : Util.capitalize(name);
                    throw new TagError(`${typeLabel}s can take up at most ${maxSize} kb`, err.ref);
                } else {
                    throw err;
                }
            }
        }

        if (!isFile) {
            const trimmedArgs = (t_args = t_args?.trimEnd() ?? "");

            body = trimmedArgs + (Util.empty(trimmedArgs) ? "" : " ");
            body += (msg.attachments ?? []).map(at => at.url).join(" ");
        }

        return { body, isScript, isBinary };
    }

    emulateTag(options) {
        options = TypeTester.isObject(options) ? options : {};

        const owner = options.owner ?? getClient().owner;

        if (!Util.nonemptyString(owner)) {
            throw new TagError("Tag owner is required for emulation");
        }

        let type = options.type;

        if (type === "script") {
            type = TagTypes.defaults.scriptType;
        }

        const meta = ObjectUtil.removeUndefinedValues({
                type,
                language: options.language
            }),
            hasMeta = !Util.empty(Object.keys(meta));

        return new Tag({
            name: options.name ?? "dummy-tag",
            body: options.body,
            owner,
            args: options.args,
            aliasName: options.aliasName ?? options.alias,
            meta: hasMeta ? meta : undefined
        });
    }

    _getRevisionOptions(options, fallbackActor) {
        options = ObjectUtil.guaranteeObject(options);

        return ObjectUtil.removeUndefinedValues({
            actor: options.actor ?? fallbackActor,
            revertOf: options.revertOf,
            restores: options.restores,
            reason: options.reason
        });
    }

    _cloneTag(tag) {
        const data = tag.getData();
        data.type = tag.type.toBuffer();

        return new Tag(data);
    }

    _getRevertedTag(subject, target, previous, tx) {
        if (target.operation === RevisionOperationTypes.create && previous === null) {
            return null;
        }

        return this.revisions.makeTag(subject, previous ?? target);
    }

    async _updateTagWithQuota(current, restored, tx) {
        if (current.name !== restored.name) {
            const existing = await tx.fetch(restored.name);

            if (existing !== null) {
                throw new TagError("Tag already exists", existing);
            }
        }

        const oldSize = current.getSize(),
            newSize = restored.getSize();

        restored.setLastEdited();

        if (current.owner !== restored.owner) {
            await this._updateQuota(restored.owner, 0, 0, tx);
        }

        const res = await tx.updateProps(current.name, restored);

        if (res.changes < 1) {
            throw new TagError("Tag doesn't exist", current.name);
        }

        if (current.owner === restored.owner) {
            await this._updateQuota(restored.owner, newSize - oldSize, 0, tx);
        } else {
            await this._updateQuota(current.owner, -oldSize, -1, tx);
            await this._updateQuota(restored.owner, newSize, 1, tx);
        }

        const aliasUpdates = [];

        if (current.name !== restored.name) {
            const aliasesBefore = await tx.fetchAliases(current.name);

            await tx.updateAliases(current.name, restored.name);

            const aliasesAfter = await tx.fetchAliases(restored.name),
                aliasesByName = this.constructor.getNameMap(aliasesBefore);

            for (const aliasAfter of aliasesAfter) {
                const aliasBefore = aliasesByName.get(aliasAfter.name);

                if (aliasBefore != null) {
                    aliasUpdates.push({
                        before: aliasBefore,
                        after: aliasAfter
                    });
                }
            }
        }

        return aliasUpdates;
    }

    async _createRevertedTag(restored, tx) {
        const existing = await tx.fetch(restored.name);

        if (existing !== null) {
            throw new TagError("Tag already exists", existing);
        }

        restored.setLastEdited();
        await this._updateQuota(restored.owner, 0, 0, tx);
        await tx.add(restored, {
            setRegistered: false
        });
        await this._updateQuota(restored.owner, restored.getSize(), 1, tx);
    }

    async _deleteRevertedTag(current, tx) {
        if (current === null) {
            return;
        }

        const res = await tx.delete(current);

        if (res.changes < 1) {
            throw new TagError("Tag doesn't exist", current.name);
        }

        await this._updateQuota(current.owner, -current.getSize(), -1, tx);
    }

    async _applyRevert(current, restored, tx) {
        if (restored === null) {
            await this._deleteRevertedTag(current, tx);
            return {
                changed: current === null ? [] : Object.keys(this.revisions.spec.getSnapshot(current.getData())),
                aliasUpdates: []
            };
        }

        if (current === null) {
            await this._createRevertedTag(restored, tx);
            return {
                changed: Object.keys(this.revisions.spec.getSnapshot(restored.getData())),
                aliasUpdates: []
            };
        }

        const before = this.revisions.spec.getSnapshot(current.getData()),
            after = this.revisions.spec.getSnapshot(restored.getData()),
            changed = Object.keys(this.revisions._manager(tx).diff(before, after));

        const aliasUpdates = await this._updateTagWithQuota(current, restored, tx);

        return {
            changed,
            aliasUpdates
        };
    }

    async _addPrepared(tag, tx, revisionOptions) {
        tag = Tag.from(tag);

        await this._updateQuota(tag.owner, 0, 0, tx);
        await tx.add(tag);
        await this.revisions.recordCreate(tag, tx, revisionOptions);

        const bodyLogText = LoggerUtil.formatLog(
            Util.trimString(tag.body, 300, null, {
                showDiff: true
            })
        );

        getLogger().info(`Added tag: "${tag.name}" with type: ${tag.type.toHex()}, body:${bodyLogText}`);

        this._checkTagSize(tag);

        const tagSize = tag.getSize();

        await this._updateQuota(tag.owner, tagSize, 1, tx);
    }

    async _runScriptTag(tag, type, args, values, options) {
        tag = Tag.from(tag);

        const evalArgs = [args, tag.args].filter(Util.nonemptyString).join(" ");

        const inputValues = {
            tag,
            args: Util.nonemptyString(evalArgs) ? evalArgs : undefined,
            ...values
        };

        switch (type) {
            case "ivm":
                const ivm = getClient().checkComponent("VMs", "tagVM", {
                    altName: TagVM.VMname
                });

                return await ivm.runScript(tag.body, inputValues, {
                    ...options,
                    language: tag.getScriptLanguage()
                });
            case "vm2":
                const vm2 = getClient().checkComponent("VMs", "tagVM2", {
                    altName: TagVM2.VMname
                });

                return await vm2.runScript(tag.body, inputValues);
        }
    }

    async _updateQuota(user, sizeDiff, countDiff, tx) {
        let userQuota = await tx.quotaFetchAll(user);

        if (userQuota === null) {
            await tx.quotaCreate(user);
            userQuota = {
                quota: 0,
                count: 0
            };
        }

        if (sizeDiff === 0 && countDiff === 0) {
            return;
        }

        const newQuota = userQuota.quota + sizeDiff,
            newCount = userQuota.count + countDiff;

        if (newQuota > this.maxQuota) {
            throw new TagError(`Maximum quota of ${this.maxQuota} kb has been exceeded`, {
                quota: newQuota,
                maxQuota: this.maxQuota
            });
        }

        if (typeof this.maxTagCount === "number" && newCount > this.maxTagCount) {
            throw new TagError(`Maximum tag count quota of ${this.maxTagCount} has been exceeded`, {
                count: newCount,
                maxTagCount: this.maxTagCount
            });
        }

        if (sizeDiff !== 0) {
            await tx.quotaSizeSet(user, newQuota);
        }

        if (countDiff !== 0) {
            await tx.quotaCountSet(user, newCount);
        }

        getLogger().debug(`Updated quota for: ${user} size diff: ${sizeDiff} count diff: ${countDiff}`);
    }

    async _incrementUsage(name) {
        await this.tag_db.transactionImmediate(async tx => {
            const res = await tx.usageIncrement(name);

            if (res.changes > 0) {
                return;
            }

            await tx.usageCreate(name);
            await tx.usageIncrement(name);
        });
    }

    _getMaxTagSize(isBinary, isScript) {
        return isBinary ? this.maxTagSize.binary : isScript ? this.maxTagSize.script : this.maxTagSize.text;
    }

    _checkTagSize(tag) {
        const tagSize = tag.getSize(),
            typeLimit = this._getMaxTagSize(tag.isBinary, tag.isScript);

        if (tagSize > typeLimit) {
            const typeName = tag.isBinary ? "Binary tag" : tag.isScript ? "Script tag" : "Tag";

            throw new TagError(`${typeName}s can take up at most ${typeLimit} kb`, {
                size: tagSize,
                limit: typeLimit
            });
        }
    }
}
export default TagManager;
