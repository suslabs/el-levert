import FakeTags from "./FakeTags.js";

import FakeTag from "../../structures/tag/FakeTag.js";

import Util from "../../util/Util.js";

import TagError from "../../errors/TagError.js";

class FakeTagRegistry {
    static register(fakeTag) {
        this._ensureInit();

        fakeTag = FakeTag.from(fakeTag);

        if (!Util.nonemptyString(fakeTag.name)) {
            throw new TagError("Invalid fake tag name", fakeTag.name);
        }

        if (typeof fakeTag.execute !== "function") {
            throw new TagError("Fake tag must have an execute function", fakeTag.name);
        }

        this._fakeTags.set(fakeTag.name.toLowerCase(), fakeTag);
    }

    static load(fakeTags) {
        for (const fakeTag of fakeTags) {
            this.register(fakeTag);
        }
    }

    static unregister(name) {
        this._ensureInit();

        if (!Util.nonemptyString(name)) {
            return false;
        }

        return this._fakeTags.delete(name.toLowerCase());
    }

    static has(name) {
        this._ensureInit();

        if (!Util.nonemptyString(name)) {
            return false;
        }

        return this._fakeTags.has(name.toLowerCase());
    }

    static get(name) {
        this._ensureInit();

        if (!Util.nonemptyString(name)) {
            return null;
        }

        return this._fakeTags.get(name.toLowerCase()) ?? null;
    }

    static getNames() {
        this._ensureInit();

        return Array.from(this._fakeTags.keys());
    }

    static fetch(name) {
        this._ensureInit();

        const fakeTag = this.get(name);
        return fakeTag !== null ? new FakeTag(fakeTag) : null;
    }

    static async execute(tag, args, values, options) {
        this._ensureInit();

        if (tag instanceof FakeTag) {
            return await tag.run(args, values, options);
        }

        const def = this.get(tag.name);

        if (def === null) {
            throw new TagError("Cannot execute tag", tag.name);
        }

        return await def.run(args, values, options);
    }

    static _fakeTags = new Map();
    static _initialized = false;

    static _ensureInit() {
        if (!this._initialized) {
            this._initialized = true;

            for (const entry of FakeTags) {
                const fakeTag = FakeTag.from(entry);
                this._fakeTags.set(fakeTag.name.toLowerCase(), fakeTag);
            }
        }
    }
}

export default FakeTagRegistry;
