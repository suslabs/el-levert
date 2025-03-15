import axios from "axios";

import DBManager from "./DBManager.js";
import TagDatabase from "../../database/TagDatabase.js";

import Tag from "../../structures/tag/Tag.js";
import TagError from "../../errors/TagError.js";

import { getClient, getLogger } from "../../LevertClient.js";
import Util from "../../util/Util.js";
import search from "../../util/search/uFuzzySearch.js";

class TagManager extends DBManager {
    static $name = "tagManager";
    static loadPriority = 0;

    constructor() {
        super(true, "tag", "tag_db", TagDatabase);

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
            return "Invalid tag name.";
        }

        if (name.length > this.maxTagNameLength) {
            return `The tag name can be at most ${this.maxTagNameLength} characters long.`;
        }

        if (!this.isTagName(name)) {
            return "The tag name must consist of Latin characters, numbers, _ or -.";
        }

        return false;
    }

    async fetch(name) {
        return await this.tag_db.fetch(name);
    }

    async fetchAlias(tag) {
        if (!tag) {
            return false;
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

                if (!lastTag) {
                    throw new TagError("Hop not found", hop);
                }
            }

            if (!Util.empty(lastTag.args)) {
                argsList.push(lastTag.args);
            }
        }

        const args = argsList.join(" ");
        lastTag.setAliasProps(hops, args);

        return lastTag;
    }

    async execute(tag, args, msg) {
        if (tag.isAlias && !tag.fetched) {
            tag = await this.fetchAlias(tag);
        }

        const ivm = getClient().tagVM,
            vm2 = getClient().tagVM2;

        const evalArgs = args + tag.args;

        let out;

        switch (tag.getType()) {
            case "text":
                out = tag.body;
                break;
            case "ivm":
                if (typeof ivm === "undefined") {
                    throw new TagError("Can't execute script tag. isolated-vm isn't initialized");
                }

                if (!ivm.enabled) {
                    throw new TagError("Can't execute script tag. isolated-vm isn't enabled");
                }

                out = await ivm.runScript(tag.body, msg, tag, evalArgs);
                break;
            case "vm2":
                if (typeof vm2 === "undefined") {
                    throw new TagError("Can't execute script tag. vm2 isn't initialized");
                }

                if (!vm2.enabled) {
                    throw new TagError("Can't execute script tag. vm2 isn't enabled");
                }

                out = await vm2.runScript(tag.body, msg, evalArgs);
                break;
            default:
                throw new TagError("Invalid tag type");
        }

        return out;
    }

    async add(name, body, owner, type) {
        const existingTag = await this.fetch(name);

        if (existingTag) {
            throw new TagError("Tag already exists", existingTag);
        }

        if (body === null || typeof body === "undefined") {
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

        const tagSize = tag.getSize();

        await this._updateQuota(owner, tagSize);
        await this.tag_db.add(tag);

        getLogger().info(`Added tag: "${name}" with type: "${type}", body:${Util.formatLog(body)}`);
        return tag;
    }

    async edit(tag, body, type) {
        if (!tag) {
            throw new TagError("Tag doesn't exist");
        }

        if (body === null || typeof body === "undefined") {
            throw new TagError("No tag body provideds");
        }

        body = body.toString().trim();

        if (Util.empty(body)) {
            throw new TagError("Tag body is empty");
        }

        const newTag = new Tag({
            ...tag,
            name: tag.name,
            body,
            type
        });

        if (tag.isEquivalent(newTag)) {
            throw new TagError("Can't update tag with the same body");
        }

        const oldTagSize = tag.getSize(),
            newTagSize = newTag.getSize(),
            sizeDiff = newTagSize - oldTagSize;

        await this._updateQuota(tag.owner, sizeDiff);
        await this.tag_db.edit(newTag);

        getLogger().info(`Edited tag: "${tag.name}" with type: "${type}", body:${Util.formatLog(body)}`);
        return newTag;
    }

    async updateProps(name, tag) {
        const oldTag = await this.fetch(name);

        if (!oldTag) {
            throw new TagError("Tag doesn't exist");
        }

        tag = new Tag(tag);

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

        getLogger().info(`Updated tag: "${oldTag.name}" with data:${Util.formatLog(tag)}`);
        return tag;
    }

    async alias(tag, aliasTag, args, createOptions) {
        if (!aliasTag) {
            throw new TagError("Alias target doesn't exist");
        }

        let create = false;

        if (!tag) {
            create = true;

            if (typeof createOptions === "undefined") {
                throw new TagError("No info for creating the tag provided");
            }
        }

        const name = tag.name ?? createOptions.name,
            owner = tag.owner ?? createOptions.owner,
            hops = [name].concat(aliasTag.hops);

        args = args?.trim();

        const newTag = new Tag({
            hops,
            name,
            owner,
            args
        });

        let newTagSize = newTag.getSize(),
            sizeDiff = newTagSize;

        if (!create) {
            if (tag.isEqual(newTag)) {
                throw new TagError("Can't alias tag with the same target and args");
            }

            const oldTagSize = tag.getSize();
            sizeDiff -= oldTagSize;
        }

        await this._updateQuota(tag.owner, sizeDiff);

        if (create) {
            await this.tag_db.add(newTag);
        } else {
            await this.tag_db.edit(newTag);
        }

        getLogger().info(`Aliased tag: "${name}" to: "${aliasTag.name}".`);
        return [newTag, create];
    }

    async chown(tag, newOwner) {
        if (!tag) {
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
        if (!tag) {
            throw new TagError("Tag doesn't exist");
        }

        const existingTag = await this.fetch(newName);

        if (existingTag) {
            throw new TagError("Tag already exists", existingTag);
        }

        const oldName = tag.name;

        await this.tag_db.rename(tag, newName);
        await this.tag_db.updateHops(oldName, newName, Tag.hopsSeparator);

        getLogger().info(`Renamed tag: "${oldName}" to: "${newName}"`);
        return tag;
    }

    async delete(tag) {
        if (!tag) {
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

    async count(user) {
        const countAll = user === null || typeof user === "undefined" || Util.empty(user);

        if (countAll) {
            return await this.tag_db.count(true);
        } else {
            return await this.tag_db.count(false, user);
        }
    }

    async search(query, maxResults = 20) {
        query = query.toLowerCase();
        const tags = await this.dump();

        return search(tags, query, {
            maxResults
        });
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

    async _updateQuota(user, diff) {
        if (diff === 0) {
            return;
        }

        let currQuota = await this.tag_db.quotaFetch(user);

        if (currQuota === false) {
            await this.tag_db.quotaCreate(user);
            currQuota = 0;
        }

        const newQuota = currQuota + diff;

        if (newQuota > this.maxQuota) {
            throw new TagError(`Maximum quota of ${this.maxQuota}kb has been exceeded`);
        }

        await this.tag_db.quotaSet(user, newQuota);
        getLogger().debug(`Updated quota for: ${user} diff: ${diff}`);
    }

    async _downloadBody(msg) {
        let body,
            isScript = false;

        const attach = msg.attachments.at(0);

        if (attach.contentType.startsWith("text/plain") || attach.contentType.startsWith("application/javascript")) {
            if (attach.size > this.maxTagSize * 1024) {
                throw new TagError(`Scripts can take up at most ${this.maxTagSize}kb`);
            }

            body = (
                await axios.request({
                    url: attach.attachment,
                    responseType: "text"
                })
            ).data;

            isScript = true;
        } else {
            body = attach.url;
        }

        return [body, isScript];
    }
}

export default TagManager;
