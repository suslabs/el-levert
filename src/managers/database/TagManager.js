import axios from "axios";

import DBManager from "./DBManager.js";

import { getClient } from "../../LevertClient.js";
import TagDatabase from "../../database/TagDatabase.js";

import Tag from "../../structures/tag/Tag.js";

import diceDist from "../../util/search/diceDist.js";
import TagError from "../../errors/TagError.js";

class TagManager extends DBManager {
    constructor() {
        super(true, "tag", TagDatabase, "tag_db");

        this.maxQuota = getClient().config.maxQuota;
        this.maxTagSize = getClient().config.maxTagSize;
        this.maxTagNameLength = getClient().config.maxTagNameLength;

        this.tagNameRegex = new RegExp(getClient().config.tagNameRegex);
    }

    isTagName(name) {
        return this.tagNameRegex.test(name);
    }

    checkName(name) {
        if (name.length > this.maxTagNameLength) {
            return `The tag name can be at most ${this.maxTagNameLength} characters long.`;
        } else if (!this.isTagName(name)) {
            return "The tag name must consist of Latin characters, numbers, _ or -.";
        }
    }

    async fetch(name) {
        return await this.tag_db.fetch(name);
    }

    async fetchAlias(tag) {
        if (!tag) {
            return false;
        }

        let hops = [],
            args = [],
            lastTag;

        for (const hop of tag.hops) {
            if (hops.includes(hop)) {
                throw new TagError("Tag recursion detected", hops);
            }

            hops.push(hop);
            lastTag = await this.fetch(hop);

            if (!lastTag) {
                throw new TagError("Hop not found", hop);
            }

            if (lastTag.args.length > 0) {
                args.push(lastTag.args);
            }
        }

        lastTag.hops = hops;
        lastTag.args = args.join(" ");

        return lastTag;
    }

    async add(name, body, owner, type) {
        const existingTag = await this.fetch(name);

        if (existingTag) {
            throw new TagError("Tag already exists");
        }

        if (typeof body === "undefined" || body.length < 1) {
            throw new TagError("Can't add an empty tag");
        }

        const tag = new Tag({
            name,
            body,
            owner,
            type
        });

        const tagSize = tag.getSize();

        await this.tag_db.add(tag);
        await this.updateQuota(owner, tagSize);

        return tag;
    }

    async edit(tag, body, type) {
        if (!tag) {
            throw new TagError("Tag doesn't exist");
        }

        if (typeof body === "undefined" || body.length < 1) {
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

        await this.tag_db.edit(newTag);
        await this.updateQuota(tag.owner, sizeDiff);

        return newTag;
    }

    async alias(tag, aliasTag, args, owner) {
        let create = false;

        if (!tag) {
            create = true;
        }

        if (!aliasTag) {
            throw new TagError("Alias target doesn't exist");
        }

        const aliasHops = aliasTag.hops,
            hops = [tag.name].concat(aliasHops);

        const newTag = new Tag({
            name: tag.name,
            args,
            hops
        });

        let newTagSize = newTag.getSize(),
            sizeDiff = newTagSize;

        if (create) {
            newTag.owner = owner;
            await this.tag_db.add(newTag);
        } else {
            const oldTagSize = tag.getSize();
            sizeDiff -= oldTagSize;

            await this.tag_db.edit(newTag);
        }

        await this.updateQuota(tag.owner, sizeDiff);

        return [newTag, create];
    }

    async chown(tag, newOwner) {
        if (!tag) {
            throw new TagError("Tag doesn't exist");
        }

        const tagSize = tag.getSize();

        await this.updateQuota(tag.owner, -tagSize);
        await this.updateQuota(newOwner, tagSize);

        await this.tag_db.chown(tag, newOwner);

        return tag;
    }

    async delete(tag) {
        if (!tag) {
            throw new TagError("Tag doesn't exist");
        }

        const tagSize = tag.getSize();

        await this.updateQuota(tag.owner, -tagSize);
        await this.tag_db.delete(tag);

        return tag;
    }

    async list(id) {
        const tags = await this.tag_db.list(id),
            newTags = tags.filter(tag => !tag.isOld),
            oldTags = tags.filter(tag => tag.isOld);

        return {
            count: tags.length,
            newTags,
            oldTags
        };
    }

    async search(name, minDist = 0.5) {
        let tags = await this.dump(),
            find;
        tags = tags.map(x => [x, diceDist(x, name)]);

        if (typeof minDist === "undefined") {
            tags.sort((a, b) => b[1] - a[1]);

            find = tags.slice(0, 5).map(x => x[0]);
        }

        find = tags.filter(x => x[1] >= minDist).map(x => x[0]);
        find.sort();

        return find;
    }

    async dump(full = false) {
        const tags = await this.tag_db.dump();

        if (full) {
            const fullDump = [];

            for (const name of tags) {
                let tag;

                try {
                    tag = await this.fetch(name);
                } catch (err) {}

                if (typeof tag !== "undefined") {
                    fullDump.push(tag);
                }
            }

            return fullDump;
        } else {
            return tags;
        }
    }

    async getQuota(id) {
        return await this.tag_db.quotaFetch(id);
    }

    async updateQuota(id, difference) {
        if (difference === 0) {
            return;
        }

        let currentQuota = await this.tag_db.quotaFetch(id);

        if (currentQuota === false) {
            await this.tag_db.quotaCreate(id);
            currentQuota = 0;
        }

        const newQuota = currentQuota + difference;

        if (newQuota > this.maxQuota) {
            throw new TagError(`Maximum quota of ${this.maxQuota}kb has been exceeded`);
        }

        await this.tag_db.quotaSet(id, newQuota);
    }

    async downloadBody(msg) {
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
