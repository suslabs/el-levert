import axios from "axios";

import DBManager from "./DBManager.js";

import { getClient } from "../../LevertClient.js";
import Util from "../../util/Util.js";

import TagError from "../../errors/TagError.js";
import Tag from "../../database/tag/Tag.js";
import TagDatabase from "../../database/tag/TagDatabase.js";

class TagManager extends DBManager {
    constructor() {
        super("tag", "tag_db.db", TagDatabase, "tag_db");

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

    fetch(name) {
        return this.tag_db.fetch(name);
    }

    dump() {
        return this.tag_db.dump();
    }

    getQuota(id) {
        return this.tag_db.quotaFetch(id);
    }

    async downloadBody(msg) {
        let body,
            isScript = false;
        const attach = msg.attachments.at(0);

        if (attach.contentType.startsWith("text/plain") || attach.contentType.startsWith("application/javascript")) {
            if (attach.size > this.maxTagSize * 1024) {
                throw new TagError(`Scripts can take up at most ${this.maxTagSize}kb.`);
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

    async updateQuota(id, inc) {
        let quota = await this.tag_db.quotaFetch(id);

        if (quota === false) {
            await this.tag_db.quotaCreate(id);
            quota = 0;
        }

        quota += inc;

        if (quota > this.maxQuota) {
            throw new TagError("Maximum quota of ${this.maxQuota}kb has been exceeded.");
        }

        await this.tag_db.quotaSet(id, quota);
    }

    async add(name, body, owner, isScript, scriptType) {
        if (typeof isScript === "undefined") {
            [body, isScript] = Util.formatScript(body);
        }

        if (body.length > 0) {
            await this.updateQuota(owner, Util.getByteLen(body) / 1024);
        }

        const newTag = new Tag({
            name: name,
            body: body,
            owner: owner,
            registered: Date.now(),
            type: 1 | (isScript << 1) | (scriptType << 2)
        });

        await this.tag_db.add(newTag);
        return newTag;
    }

    async chown(tag, newOwner) {
        const t_quota = Util.getByteLen(tag.body) / 1024;

        await this.updateQuota(tag.owner, -t_quota);
        await this.updateQuota(newOwner, t_quota);

        await this.tag_db.chown(tag, newOwner);
    }

    async delete(tag) {
        let t_quota = -Util.getByteLen(tag.body) / 1024;

        if (tag.args.length > 0) {
            t_quota -= Util.getByteLen(tag.args) / 1024;
        }

        await this.updateQuota(tag.owner, t_quota);
        await this.tag_db.delete(tag.name);
    }

    async edit(tag, body, isScript, scriptType) {
        if (tag.body === body) {
            return;
        }

        if (typeof isScript === "undefined") {
            [body, isScript] = Util.formatScript(body);
        }

        const newTag = new Tag({
            hops: tag.name,
            name: tag.name,
            body: body,
            type: 1 | (isScript << 1) | (scriptType << 2)
        });

        let t_quota = (Util.getByteLen(body) - Util.getByteLen(tag.body)) / 1024;

        if (tag.args.length > 0) {
            t_quota -= Util.getByteLen(tag.args);
        }

        if (t_quota !== 0) {
            await this.updateQuota(tag.owner, t_quota);
        }

        await this.tag_db.edit(newTag);
        return newTag;
    }

    async list(id) {
        const tags = await this.tag_db.list(id),
            newTags = tags.filter(x => (x.type & 1) === 1),
            oldTags = tags.filter(x => (x.type & 1) === 0);

        return {
            newTags: newTags,
            oldTags: oldTags,
            count: tags.length
        };
    }

    async search(name, minDist = 0.4) {
        let tags = await this.dump(),
            find;
        tags = tags.map(x => [x, Util.diceDist(x, name)]);

        if (typeof minDist === "undefined") {
            tags.sort((a, b) => b[1] - a[1]);

            find = tags.slice(0, 5).map(x => x[0]);
        }

        find = tags.filter(x => x[1] >= minDist).map(x => x[0]);
        find.sort();

        return find;
    }

    async fetchAlias(tag) {
        let hops = [],
            args = [],
            tagHop;

        for (const hop of tag.hops) {
            if (hops.includes(hop)) {
                throw new TagError("Tag recursion detected.", hops);
            }

            hops.push(hop);
            tagHop = await this.fetch(hop);

            if (!tagHop) {
                throw new TagError("Hop not found.", hop);
            }

            if (tagHop.args.length > 0) {
                args.push(tagHop.args);
            }
        }

        tagHop.hops = tag.hops;
        tagHop.args = args.join(" ");

        return tagHop;
    }

    async alias(tag, a_name, a_hops, args) {
        const newTag = new Tag({
            name: tag.name,
            body: "",
            args: args,
            type: 1
        });

        let t_quota = (Util.getByteLen(args) - Util.getByteLen(tag.body)) / 1024;

        if (tag.args.length > 0) {
            t_quota -= Util.getByteLen(tag.args) / 1024;
        }

        if (typeof a_hops === "undefined" || a_hops.length === 0) {
            a_hops = [a_name];
        }

        newTag.hops = [tag.name].concat(a_hops);

        if (t_quota !== 0) {
            await this.updateQuota(tag.owner, t_quota);
        }

        await this.tag_db.edit(newTag);
        return newTag;
    }
}

export default TagManager;
