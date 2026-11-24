import Util from "../Util.js";
import ArrayUtil from "../ArrayUtil.js";
import ObjectUtil from "../ObjectUtil.js";

import UtilError from "../../errors/UtilError.js";

class BM25Index {
    static defaultValues = {
        k1: 1.2,
        b: 0.75,
        prefixWeight: 0,
        minPrefixLength: 3
    };

    static stopWords = new Set(
        "a an and are as at be by do does for from how i in is it me my of on or the this to what when where which who why with you your".split(
            " "
        )
    );

    static tokenize(str) {
        return String(str ?? "")
            .toLowerCase()
            .split(BM25Index._splitRegex)
            .filter(token => !Util.empty(token) && !BM25Index.stopWords.has(token));
    }

    constructor(fieldWeights, options) {
        if (!Object.values(ObjectUtil.guaranteeObject(fieldWeights)).some(weight => weight > 0)) {
            throw new UtilError("At least one weighted field is required");
        }

        this.fieldWeights = fieldWeights;
        ObjectUtil.setValuesWithDefaults(this, options, BM25Index.defaultValues);

        this.entries = [];
        this.docFreqs = new Map();
    }

    get size() {
        return this.entries.length;
    }

    add(doc) {
        const termFreqs = new Map();
        let length = 0;

        for (const [field, weight] of Object.entries(this.fieldWeights)) {
            const tokens = BM25Index.tokenize(doc[field]);
            length += tokens.length * weight;

            for (const token of tokens) {
                termFreqs.set(token, (termFreqs.get(token) ?? 0) + weight);
            }
        }

        for (const token of termFreqs.keys()) {
            this.docFreqs.set(token, (this.docFreqs.get(token) ?? 0) + 1);
        }

        this.entries.push({ doc, termFreqs, length: Math.max(length, 1) });
    }

    search(query, limit = Infinity) {
        const terms = ArrayUtil.unique(BM25Index.tokenize(query));

        if (Util.empty(terms) || Util.empty(this.entries)) {
            return [];
        }

        const avgLength = this.entries.reduce((sum, entry) => sum + entry.length, 0) / this.size;

        const expansions = terms.map(term => this._expandTerm(term));

        return this.entries
            .map(entry => ({ doc: entry.doc, score: this._score(entry, expansions, avgLength) }))
            .filter(res => res.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    static _splitRegex = /[^\p{L}\p{N}]+/u;

    _idf(term) {
        const docFreq = this.docFreqs.get(term) ?? 0;
        return Math.log(1 + (this.size - docFreq + 0.5) / (docFreq + 0.5));
    }

    _expandTerm(term) {
        const matches = [[term, 1]];

        if (this.prefixWeight <= 0 || term.length < this.minPrefixLength) {
            return matches;
        }

        for (const token of this.docFreqs.keys()) {
            if (token !== term && token.startsWith(term)) {
                matches.push([token, this.prefixWeight]);
            }
        }

        return matches;
    }

    _scoreToken(entry, token, norm) {
        const freq = entry.termFreqs.get(token) ?? 0;
        return freq > 0 ? this._idf(token) * ((freq * (this.k1 + 1)) / (freq + this.k1 * norm)) : 0;
    }

    _score(entry, expansions, avgLength) {
        const norm = 1 - this.b + (this.b * entry.length) / avgLength;

        return expansions.reduce(
            (score, matches) =>
                score + Math.max(...matches.map(([token, weight]) => weight * this._scoreToken(entry, token, norm))),
            0
        );
    }
}

export default BM25Index;
