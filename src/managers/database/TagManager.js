import DBManager from "./DBManager.js";
import TagDatabase from "../../database/TagDatabase.js";

import Tag from "../../structures/tag/Tag.js";
import { TagTypes } from "../../structures/tag/TagTypes.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import RegexUtil from "../../util/misc/RegexUtil.js";
import search from "../../util/search/uFuzzySearch.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import LoggerUtil from "../../util/LoggerUtil.js";

import TagError from "../../errors/TagError.js";

class TagManager extends DBManager {
    static $name = "tagManager";
    static loadPriority = 0;

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

    checkName(name) {
        if (Util.empty(name)) {
            return "Invalid tag name";
        } else if (name.length > this.maxTagNameLength) {
            return `The tag name can be at most ${this.maxTagNameLength} characters long`;
        } else if (!this.isTagName(name)) {
            return "The tag name must consist of Latin characters, numbers, _ or -";
        } else {
            return false;
        }
    }

    async fetch(name) {
        return await this.tag_db.fetch(name);
    }

    async fetchAlias(tag) {
        if (tag === null) {
            return null;
        }

        const hops = [],
            argsList = [];

        let lastTag;

        for (const hop of tag.hops) {
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

            if (!Util.empty(lastTag.args)) {
                argsList.push(lastTag.args);
            }
        }

        const args = argsList.join(" ");
        lastTag._setAliasProps(hops, args);

        return lastTag;
    }

    async execute(tag, args, ...values) {
        if (tag.isAlias && !tag._fetched) {
            tag = await this.fetchAlias(tag);
        }

        const type = tag.getType();

        if (type === TagTypes.textType) {
            return tag.body;
        } else if (TagTypes.scriptTypes.includes(type)) {
            return await this._runScriptTag(tag, type, args, ...values);
        } else {
            throw new TagError("Invalid tag type");
        }
    }

    async add(name, body, owner, type) {
        const existingTag = await this.fetch(name);

        if (existingTag) {
            throw new TagError("Tag already exists", existingTag);
        }

        if (body == null) {
            throw new TagError("No tag body provided");
        }

        body = body.toString().trim();

        if (Util.empty(body)) {
            throw new TagError("Can't add an empty tag");
        }

        const tag = new Tag({
            name,
            body,
            owner,
            type
        });

        await this._add(tag);
        return tag;
    }

    async edit(tag, body, type) {
        if (tag === null) {
            throw new TagError("Tag doesn't exist");
        }

        if (body == null) {
            throw new TagError("No tag body provideds");
        }

        body = body.toString().trim();

        if (Util.empty(body)) {
            throw new TagError("Tag body is empty");
        }

        const newTag = new Tag({
            ...tag,
            body,
            type
        });

        if (tag.equivalent(newTag)) {
            throw new TagError("Can't update tag with the same body");
        }

        const oldTagSize = tag.getSize(),
            newTagSize = newTag.getSize(),
            sizeDiff = newTagSize - oldTagSize;

        await this._updateQuota(tag.owner, sizeDiff);
        await this.tag_db.edit(newTag);

        getLogger().info(`Edited tag: "${tag.name}" with type: ${type}, body:${LoggerUtil.formatLog(body)}`);
        return newTag;
    }

    async updateProps(name, tag) {
        let oldTag;

        if (name instanceof Tag) {
            oldTag = name;
            name = oldTag.name;
        } else {
            oldTag = await this.fetch(name);

            if (oldTag === null) {
                throw new TagError("Tag doesn't exist");
            }
        }

        if (!(tag instanceof Tag)) {
            tag = new Tag(tag);
        }

        if (name !== tag.name) {
            const existingTag = await this.fetch(tag.name);

            if (existingTag) {
                throw new TagError("Tag already exists", existingTag);
            }
        }

        if (!oldTag.sameBody(tag)) {
            const oldTagSize = oldTag.getSize(),
                newTagSize = tag.getSize(),
                sizeDiff = newTagSize - oldTagSize;

            if (oldTag.owner === tag.owner) {
                await this._updateQuota(tag.owner, sizeDiff);
            } else {
                await this._updateQuota(oldTag.owner, -sizeDiff);
                await this._updateQuota(tag.owner, sizeDiff);
            }
        }

        await this.tag_db.updateProps(name, tag);

        getLogger().info(`Updated tag: "${oldTag.name}" with data:${LoggerUtil.formatLog(tag.getData())}`);
        return tag;
    }

    async alias(tag, aliasTag, args, createOptions) {
        if (aliasTag === null) {
            throw new TagError("Alias target doesn't exist");
        }

        let create = false;

        if (tag === null) {
            if (!TypeTester.isObject(createOptions)) {
                throw new TagError("No info for creating the tag provided");
            }

            create = true;
        }

        const name = tag?.name ?? createOptions.name,
            owner = tag?.owner ?? createOptions.owner;

        const newTag = new Tag({
            name,
            owner
        });

        newTag.aliasTo(aliasTag, args?.trim());

        let newTagSize = newTag.getSize(),
            sizeDiff = newTagSize;

        if (!create) {
            if (tag.equals(newTag)) {
                throw new TagError("Can't alias tag with the same target and args");
            }

            const oldTagSize = tag.getSize();
            sizeDiff -= oldTagSize;
        }

        await this._updateQuota(owner, sizeDiff);
        await this.tag_db[create ? "add" : "edit"](newTag);

        getLogger().info(`Aliased tag: "${name}" to: "${aliasTag.name}".`);
        return [newTag, create];
    }

    async chown(tag, newOwner) {
        if (tag === null) {
            throw new TagError("Tag doesn't exist");
        }

        const tagSize = tag.getSize();

        await this._updateQuota(tag.owner, -tagSize);
        await this._updateQuota(newOwner, tagSize);

        await this.tag_db.chown(tag, newOwner);

        getLogger().info(`Transferred tag: "${tag.name}" to: ${newOwner}`);
        return tag;
    }

    async rename(tag, newName) {
        if (tag === null) {
            throw new TagError("Tag doesn't exist");
        }

        const existingTag = await this.fetch(newName);

        if (existingTag) {
            throw new TagError("Tag already exists", existingTag);
        }

        const oldName = tag.name;

        await this.tag_db.rename(tag, newName);
        await this.tag_db.updateHops(oldName, newName, Tag._hopsSeparator);

        getLogger().info(`Renamed tag: "${oldName}" to: "${newName}"`);
        return tag;
    }

    async delete(tag) {
        if (tag === null) {
            throw new TagError("Tag doesn't exist");
        }

        const tagSize = tag.getSize();

        await this._updateQuota(tag.owner, -tagSize);
        await this.tag_db.delete(tag);

        getLogger().info(`Deleted tag: "${tag.name}".`);
        return tag;
    }

    async dump(full = false) {
        if (full) {
            return await this.tag_db.fullDump();
        } else {
            return await this.tag_db.dump();
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
        const countAll = user == null || Util.empty(user),
            flag = Tag.getFlag(flags) || null;

        if (countAll) {
            return await this.tag_db.count(true, null, flag);
        } else {
            return await this.tag_db.count(false, user, flag);
        }
    }

    async search(query, maxResults = 20) {
        query = query.toLowerCase();
        const tags = await this.dump();

        return search(tags, query, {
            maxResults
        });
    }

    async random(prefix) {
        let tags;

        if (Util.empty(prefix)) {
            tags = await this.dump();
        } else {
            const exp = new RegExp(`^${RegexUtil.escapeRegex(prefix)}\\d+?$`);

            tags = await this.tag_db.searchPrefix(prefix);
            tags = tags.filter(tag => exp.test(tag));
        }

        return Util.randomElement(tags) ?? null;
    }

    async leaderboard(type, limit = 20) {
        let leaderboard;

        switch (type) {
            case "count":
                leaderboard = await this.tag_db.countLeaderboard(limit);
                break;
            case "size":
                leaderboard = await this.tag_db.sizeLeaderboard(limit);
                break;
            default:
                throw new TagError("Invalid leaderboard type: " + type);
        }

        for (const entry of leaderboard) {
            const id = entry.user,
                user = await getClient().findUserById(id);

            if (user) {
                entry.user = user;
            } else {
                entry.user = {
                    username: "NOT FOUND"
                };
            }
        }

        return leaderboard;
    }

    async getQuota(user) {
        return await this.tag_db.quotaFetch(user);
    }

    async fetchTagBody(t_args, msg) {
        let isFile = true;
        let body,
            isScript = false;

        try {
            body = await DiscordUtil.fetchAttachment(msg, undefined, {
                allowedContentTypes: TagManager._fileContentTypes,
                maxSize: this.maxTagSize
            });
        } catch (err) {
            if (Util.hasPrefix(["Message doesn't have", "Invalid content type"], err.message)) {
                isFile = false;
            } else if (err.message.startsWith("The attachment can take up at most")) {
                throw new TagError(`Tags can take up at most ${this.maxTagSize} kb`);
            } else {
                throw err;
            }
        }

        if (isFile) {
            const attach = msg.attachments.at(0);
            isScript = Util.hasPrefix(TagManager._scriptContentTypes, attach.contentType);
        } else {
            body = t_args?.trimEnd() ?? "";

            if (!Util.empty(body)) {
                body += " ";
            }

            body += msg.attachments.map(at => at.url).join(" ");
        }

        return [body, isScript];
    }

    static _scriptContentTypes = ["application/javascript"];
    static _fileContentTypes = this._scriptContentTypes.concat(["text/plain"]);

    async _add(tag) {
        const tagSize = tag.getSize();

        await this._updateQuota(tag.owner, tagSize);
        await this.tag_db.add(tag);

        const bodyLogStr = LoggerUtil.formatLog(Util.trimString(tag.body, 300, null, true));
        getLogger().info(`Added tag: "${tag.name}" with type: ${tag.type}, body:${bodyLogStr}`);
    }

    async _runScriptTag(tag, type, args, msg) {
        const evalArgs = [args, tag.args].filter(str => !Util.empty(str)).join(" ");

        switch (type) {
            case "ivm":
                const ivm = getClient().tagVM;

                if (typeof ivm === "undefined") {
                    throw new TagError("Can't execute script tag. isolated-vm isn't initialized");
                }

                if (!ivm.enabled) {
                    throw new TagError("Can't execute script tag. isolated-vm isn't enabled");
                }

                return await ivm.runScript(tag.body, { msg, tag, args: evalArgs });
            case "vm2":
                const vm2 = getClient().tagVM2;

                if (typeof vm2 === "undefined") {
                    throw new TagError("Can't execute script tag. vm2 isn't initialized");
                }

                if (!vm2.enabled) {
                    throw new TagError("Can't execute script tag. vm2 isn't enabled");
                }

                return await vm2.runScript(tag.body, { msg, args: evalArgs });
        }
    }

    async _updateQuota(user, diff) {
        if (diff === 0) {
            return;
        }

        let currQuota = await this.tag_db.quotaFetch(user);

        if (currQuota === null) {
            await this.tag_db.quotaCreate(user);
            currQuota = 0;
        }

        const newQuota = currQuota + diff;

        if (newQuota > this.maxQuota) {
            throw new TagError(`Maximum quota of ${this.maxQuota} kb has been exceeded`);
        }

        await this.tag_db.quotaSet(user, newQuota);
        getLogger().debug(`Updated quota for: ${user} diff: ${diff}`);
    }
}

export default TagManager;
