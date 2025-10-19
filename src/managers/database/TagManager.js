import DBManager from "./DBManager.js";
import TagDatabase from "../../database/TagDatabase.js";

import Tag from "../../structures/tag/Tag.js";
import { TagTypes } from "../../structures/tag/TagTypes.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import RegexUtil from "../../util/misc/RegexUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import LoggerUtil from "../../util/LoggerUtil.js";

import TagVM from "../../vm/isolated-vm/TagVM.js";
import TagVM2 from "../../vm/vm2/TagVM2.js";

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

        this.maxQuota = getClient().config.maxQuota;
        this.maxTagSize = getClient().config.maxTagSize;

        this.maxTagNameLength = getClient().config.maxTagNameLength;
        this.tagNameRegex = new RegExp(getClient().config.tagNameRegex);
    }

    isTagName(name) {
        return this.tagNameRegex.test(name);
    }

    checkName(name, throwErrors = true) {
        let msg, ref;
        name = name.trim();

        if (typeof name !== "string" || Util.empty(name)) {
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

    checkBody(body, throwErrors = true) {
        body = body.toString().trim();

        let msg, ref;

        if (Util.empty(body)) {
            msg = "Tag body is empty";
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

    async fetch(name, validate = false) {
        if (validate) {
            this.checkName(name);
        }

        const tag = await this.tag_db.fetch(name);

        return validate && tag === null
            ? (() => {
                  throw new TagError("Tag doesn't exist", name);
              })()
            : tag;
    }

    async fetchAlias(tag, aliasOriginal = false, validate = false) {
        if (tag === null) {
            return validate
                ? null
                : (() => {
                      throw new TagError("Tag doesn't exist");
                  })();
        } else if (!tag.isAlias || tag._fetched) {
            return tag;
        } else if (validate) {
            this.checkName(tag.name);
        }

        const hops = [],
            args = [];

        let lastTag = null;

        for (const hop of tag.hops) {
            if (validate) {
                this.checkName(hop);
            }

            if (hops.includes(hop)) {
                const recursionHops = hops.concat(hop);
                throw new TagError("Tag recursion detected", recursionHops);
            }

            hops.push(hop);

            if (hop === tag.name) {
                lastTag = tag;
            } else {
                lastTag = await this.fetch(hop);

                if (lastTag === null) {
                    throw new TagError("Hop not found", hop);
                }
            }

            args.push(lastTag.args);
        }

        lastTag._setAliasProps(hops, args);

        if (aliasOriginal) {
            lastTag._setOriginalProps(tag);
        }

        return lastTag;
    }

    async execute(tag, args, values = {}) {
        tag = await this.fetchAlias(tag, true);
        const type = tag.getType();

        if (type === TagTypes.textType) {
            return tag.body;
        } else if (TagTypes.scriptTypes.includes(type)) {
            return await this._runScriptTag(tag, type, args, values);
        } else {
            throw new TagError("Invalid tag type", type);
        }
    }

    async add(name, body, owner, type, validate = {}) {
        let validateNew, checkExisting;

        if (typeof validate === "boolean") {
            validateNew = checkExisting = validate;
        } else {
            validateNew = validate.validateNew ?? true;
            checkExisting = validate.checkExisting ?? true;
        }

        if (validateNew) {
            name = this.checkName(name);
            body = this.checkBody(body);
        }

        if (checkExisting) {
            const existingTag = await this.fetch(name);

            if (existingTag !== null) {
                throw new TagError("Tag already exists", existingTag);
            }
        }

        const tag = new Tag({ name, body, owner, type });
        await this._addPrepared(tag);

        return tag;
    }

    async edit(tag, body, type, validate = {}) {
        let validateProvided, validateNew, checkExisting;

        if (typeof validate === "boolean") {
            validateProvided = validateNew = checkExisting = validate;
        } else {
            validateProvided = validate.validateProvided ?? false;
            validateNew = validate.validateNew ?? true;
            checkExisting = validate.checkExisting ?? true;
        }

        if (tag === null) {
            throw new TagError("Tag doesn't exist");
        } else if (validateProvided) {
            this.checkName(tag.name);
        }

        if (validateNew) {
            body = this.checkBody(body);
        }

        const newTag = new Tag({
            ...tag,
            body,
            type
        });

        if (checkExisting && tag.equivalent(newTag)) {
            throw new TagError("Can't update tag with the same body", tag);
        }

        const res = await this.tag_db.edit(newTag),
            updated = res.changes > 0;

        if (updated) {
            getLogger().info(`Edited tag: "${tag.name}" with type: ${type}, body:${LoggerUtil.formatLog(body)}`);
        } else if (validateProvided) {
            throw new TagError("Tag doesn't exist", tag.name);
        }

        const sizeDiff = newTag.getSize() - tag.getSize();
        await this._updateQuota(tag.owner, sizeDiff);

        return newTag;
    }

    async updateProps(name, tag, validate = {}) {
        let validateProvided, validateNew, checkExisting;

        if (typeof validate === "boolean") {
            validateProvided = validateNew = checkExisting = validate;
        } else {
            validateProvided = validate.validateProvided ?? false;
            validateNew = validate.validateNew ?? true;
            checkExisting = validate.checkExisting ?? true;
        }

        let oldTag = null;

        if (name instanceof Tag) {
            oldTag = name;
            name = oldTag.name;

            if (validateProvided) {
                this.checkName(name);
            }
        } else {
            if (validateProvided) {
                this.checkName(name);
            }

            oldTag = await this.fetch(name);

            if (oldTag === null) {
                throw new TagError("Tag doesn't exist", name);
            }
        }

        if (!(tag instanceof Tag)) {
            tag = new Tag(tag);
        }

        if (validateNew) {
            this.checkName(tag.name);
            this.checkBody(tag.body);
        }

        if (checkExisting && name !== tag.name) {
            const existingTag = await this.fetch(tag.name);

            if (existingTag !== null) {
                throw new TagError("Tag already exists", existingTag);
            }
        }

        if (!validateNew || !oldTag.sameBody(tag)) {
            const sizeDiff = tag.getSize() - oldTag.getSize();

            if (oldTag.owner === tag.owner) {
                await this._updateQuota(tag.owner, sizeDiff);
            } else {
                await this._updateQuota(oldTag.owner, -sizeDiff);
                await this._updateQuota(tag.owner, sizeDiff);
            }
        }

        const res = await this.tag_db.updateProps(name, tag),
            updated = res.changes > 0;

        if (updated) {
            getLogger().info(`Updated tag: "${oldTag.name}" with data:${LoggerUtil.formatLog(tag.getData())}`);
        } else if (validateProvided) {
            throw new TagError("Tag doesn't exist", name);
        }

        return tag;
    }

    async alias(tag, aliasTag, args, createOptions, validate = {}) {
        let validateProvided, validateNew, checkExisting;

        if (typeof validate === "boolean") {
            validateProvided = validateNew = checkExisting = validate;
        } else {
            validateProvided = validate.validateProvided ?? false;
            validateNew = validate.validateNew ?? true;
            checkExisting = validate.checkExisting ?? false;
        }

        if (aliasTag === null) {
            throw new TagError("Alias target doesn't exist");
        } else if (validateProvided) {
            this.checkName(aliasTag.name);
        }

        let validateAliasName = false;
        let create, name, owner;

        if (tag === null) {
            if (!TypeTester.isObject(createOptions)) {
                throw new TagError("No info for creating the tag provided");
            }

            validateAliasName = validateNew;

            ({ name, owner } = createOptions);
            create = true;
        } else {
            validateAliasName = validateProvided;

            ({ name, owner } = tag);
            create = false;
        }

        if (validateAliasName) {
            this.checkName(name);
        }

        const newTag = new Tag({ name, owner });
        newTag.aliasTo(aliasTag, args?.trim());

        let sizeDiff = newTag.getSize();

        if (create) {
            if (checkExisting) {
                const existingTag = await this.fetch(newTag.name);

                if (existingTag !== null) {
                    throw new TagError("Tag already exists", existingTag);
                }
            }

            await this.tag_db.add(newTag);
            getLogger().info(`Created tag: "${newTag.name}" and aliased to: "${aliasTag.name}".`);
        } else {
            if (tag.equals(newTag)) {
                throw new TagError("Can't alias tag with the same target and args");
            }

            sizeDiff -= tag.getSize();

            const res = await this.tag_db.edit(newTag),
                updated = res.changes > 0;

            if (updated) {
                getLogger().info(`Aliased tag: "${newTag.name}" to: "${aliasTag.name}".`);
            } else if (validateProvided) {
                throw new TagError("Tag doesn't exist", tag.name);
            }
        }

        await this._updateQuota(newTag.owner, sizeDiff);
        return [newTag, create];
    }

    async chown(tag, newOwner, validate = false) {
        if (tag === null) {
            throw new TagError("Tag doesn't exist");
        } else if (validate) {
            this.checkName(tag.name);
        }

        const res = await this.tag_db.chown(tag, newOwner),
            updated = res.changes > 0;

        if (updated) {
            getLogger().info(`Transferred tag: "${tag.name}" to: ${newOwner}`);
        } else if (validate) {
            throw new TagError("Tag doesn't exist", tag.name);
        }

        const tagSize = tag.getSize();

        await this._updateQuota(tag.owner, -tagSize);
        await this._updateQuota(newOwner, tagSize);

        return tag;
    }

    async rename(tag, newName, validate = {}) {
        let validateProvided, validateNew, checkExisting;

        if (typeof validate === "boolean") {
            validateProvided = validateNew = checkExisting = validate;
        } else {
            validateProvided = validate.validateProvided ?? false;
            validateNew = validate.validateNew ?? true;
            checkExisting = validate.checkExisting ?? true;
        }

        const oldName = tag?.name;

        if (tag === null) {
            throw new TagError("Tag doesn't exist");
        } else if (validateProvided) {
            this.checkName(oldName);
        }

        if (validateNew) {
            this.checkName(newName);
        }

        if (checkExisting && oldName === newName) {
            throw new TagError("Can't update tag with the same name", tag);
        }

        if (checkExisting) {
            const existingTag = await this.fetch(newName);

            if (existingTag !== null) {
                throw new TagError("Tag already exists", existingTag);
            }
        }

        const res = await this.tag_db.rename(tag, newName),
            updated = res.changes > 0;

        if (updated) {
            await this.tag_db.updateHops(oldName, newName, Tag._hopsSeparator);
            getLogger().info(`Renamed tag: "${oldName}" to: "${newName}"`);
        } else if (validateProvided) {
            throw new TagError("Tag doesn't exist", tag.name);
        }

        return tag;
    }

    async delete(tag, validate = false) {
        if (tag === null) {
            throw new TagError("Tag doesn't exist");
        } else if (validate) {
            this.checkName(tag.name);
        }

        const tagSize = tag.getSize();

        const res = await this.tag_db.delete(tag),
            updated = res.changes > 0;

        if (updated) {
            getLogger().info(`Deleted tag: "${tag.name}".`);
        } else if (validate) {
            throw new TagError("Tag doesn't exist", tag.name);
        }

        await this._updateQuota(tag.owner, -tagSize);
        return tag;
    }

    async dump(full = false, flags) {
        const flag = Tag.getFlag(flags) || null;

        if (full) {
            return await this.tag_db.fullDump(flag);
        } else {
            return await this.tag_db.dump(flag);
        }
    }

    async list(user) {
        const tags = await this.tag_db.list(user),
            newTags = tags.filter(tag => !tag.isOld),
            oldTags = tags.filter(tag => tag.isOld);

        return {
            count: tags.length,
            newTags,
            oldTags
        };
    }

    async count(user, flags) {
        if (Util.empty(user)) {
            user = null;
        }

        const flag = Tag.getFlag(flags) || null;

        return await this.tag_db.count(user, flag);
    }

    async search(query, maxResults = 20, minDist, validate = false) {
        if (validate) {
            this.checkName(query);
        }

        const tags = await this.dump();

        return diceSearch(tags, query, {
            maxResults,
            minDist
        });
    }

    async fullSearch(query, maxResults = 20) {
        let tags = await this.dump(true, [false, "script"]);

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
        if (Util.empty(prefix)) {
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

        let leaderboard = [];

        switch (type) {
            case "count":
                leaderboard = await this.tag_db.countLeaderboard(limit);
                break;
            case "size":
                leaderboard = await this.tag_db.sizeLeaderboard(limit);
                break;
            default:
                throw new TagError("Invalid leaderboard type: " + type, type);
        }

        await Promise.all(
            leaderboard.map(entry =>
                getClient()
                    .findUserById(entry.user)
                    .catch(_ => null)
                    .then(user => (entry.user = user ?? defaultUser))
            )
        );

        return leaderboard;
    }

    async getQuota(user) {
        return await this.tag_db.quotaFetch(user);
    }

    async downloadBody(t_args, msg, type) {
        let name, attach, body;

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

        let isFile = true,
            isScript = false;

        try {
            ({ attach, body } = await DiscordUtil.fetchAttachment(msg, undefined, {
                allowedContentTypes: TagManager._fileContentTypes,
                maxSize: this.maxTagSize
            }));
        } catch (err) {
            if (Util.hasPrefix(["Message doesn't have", "Invalid content type"], err.message)) {
                isFile = false;
            } else if (err.message?.startsWith("The attachment can take up at most")) {
                throw new TagError(`${Util.capitalize(name)}s can take up at most ${this.maxTagSize} kb`, err.ref);
            } else {
                throw err;
            }
        }

        if (isFile) {
            isScript = Util.hasPrefix(TagManager._scriptContentTypes, attach.contentType);
        } else {
            const trimmedArgs = (t_args = t_args?.trimEnd() ?? "");
            body = trimmedArgs + (Util.empty(trimmedArgs) ? "" : " ");
            body += msg.attachments.map(at => at.url).join(" ");
        }

        return { body, isScript };
    }

    static _scriptContentTypes = ["application/javascript"];
    static _fileContentTypes = this._scriptContentTypes.concat(["text/plain"]);

    async _addPrepared(tag) {
        await this.tag_db.add(tag);

        const bodyLogStr = LoggerUtil.formatLog(
            Util.trimString(tag.body, 300, null, {
                showDiff: true
            })
        );

        getLogger().info(`Added tag: "${tag.name}" with type: ${tag.type}, body:${bodyLogStr}`);

        const tagSize = tag.getSize();
        await this._updateQuota(tag.owner, tagSize);
    }

    async _runScriptTag(tag, type, args, values) {
        const evalArgs = [args, tag.args].filter(Boolean).join(" ");

        const inputValues = {
            tag,
            args: evalArgs,
            ...values
        };

        switch (type) {
            case "ivm":
                const ivm = getClient().checkComponent("VMs", "tagVM", {
                    altName: TagVM.VMname
                });

                return await ivm.runScript(tag.body, inputValues);
            case "vm2":
                const vm2 = getClient().checkComponent("VMs", "tagVM2", {
                    altName: TagVM2.VMname
                });

                return await vm2.runScript(tag.body, inputValues);
        }
    }

    async _updateQuota(user, diff) {
        if (diff === 0) {
            return;
        }

        let userQuota = await this.tag_db.quotaFetch(user);

        if (userQuota === null) {
            await this.tag_db.quotaCreate(user);
            userQuota = 0;
        }

        const newQuota = userQuota + diff;

        if (newQuota > this.maxQuota) {
            throw new TagError(`Maximum quota of ${this.maxQuota} kb has been exceeded`, {
                quota: newQuota,
                maxQuota: this.maxQuota
            });
        }

        await this.tag_db.quotaSet(user, newQuota);
        getLogger().debug(`Updated quota for: ${user} diff: ${diff}`);
    }
}

export default TagManager;
