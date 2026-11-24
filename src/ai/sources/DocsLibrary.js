import fs from "node:fs/promises";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import BM25Index from "../../util/search/BM25Index.js";

class DocsLibrary {
    static fieldWeights = {
        title: 3,
        text: 1
    };

    static indexOptions = {
        prefixWeight: 0.6
    };

    static maxSectionLength = 4000;

    constructor(http, options) {
        options = ObjectUtil.guaranteeObject(options);

        this.http = http;

        this.name = options.name;
        this.files = options.files ?? [];
        this.urls = options.urls ?? {};

        this.index = new BM25Index(DocsLibrary.fieldWeights, DocsLibrary.indexOptions);
    }

    async load(timeout) {
        for (const file of this.files) {
            this._addSections(DocsLibrary._splitMarkdown(await fs.readFile(file, "utf8")));
        }

        for (const [title, url] of Object.entries(this.urls)) {
            const res = await this.http.request({ url, responseType: "text", timeout });
            this._addSections(DocsLibrary._splitCode(title, String(res.data)));
        }
    }

    search(query, limit) {
        return this.index.search(query, limit).map(res => res.doc);
    }

    static _headingRegex = /^## /m;
    static _blockRegex = /\n\s*\n/;
    static _declarationRegex = /^(?:\/\*\*|export |declare )/;
    static _commentLineRegex = /^\s*(?:\/\*\*|\*|\/\/)/;

    static _splitMarkdown(text) {
        return text
            .split(DocsLibrary._headingRegex)
            .filter(Util.nonemptyString)
            .map(part => {
                const [title, ...lines] = part.split("\n");
                return { title: title.trim(), text: lines.join("\n").trim() };
            });
    }

    static _getTitle(title, block) {
        const declaration = block.split("\n").find(line => !DocsLibrary._commentLineRegex.test(line)) ?? "";
        return Util.empty(declaration.trim()) ? title : `${title}: ${Util.trimString(declaration.trim(), 100)}`;
    }

    static _chunk(title, text) {
        const parts = [];

        for (let i = 0; i < text.length; i += DocsLibrary.maxSectionLength) {
            parts.push({ title, text: text.slice(i, i + DocsLibrary.maxSectionLength) });
        }

        return parts;
    }

    static _splitCode(title, text) {
        const blocks = [];

        for (const block of text.split(DocsLibrary._blockRegex)) {
            const last = Util.last(blocks);

            if (typeof last === "undefined" || DocsLibrary._declarationRegex.test(block.trimStart())) {
                blocks.push(block);
            } else {
                blocks[blocks.length - 1] = `${last}\n\n${block}`;
            }
        }

        return blocks.flatMap(block => DocsLibrary._chunk(DocsLibrary._getTitle(title, block), block.trim()));
    }

    _addSections(sections) {
        sections.forEach(section => this.index.add(section));
    }
}

export default DocsLibrary;
