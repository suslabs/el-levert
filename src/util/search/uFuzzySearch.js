import uFuzzy from "@leeoniya/ufuzzy";

import Util from "../Util.js";
import ArrayUtil from "../ArrayUtil.js";
import ObjectUtil from "../ObjectUtil.js";

class uFuzzySearch {
    static defaultOptions = Object.freeze({
        alpha: "a-z"
    });

    static tagSearchOptions = Object.freeze({
        alpha: "a-z",
        interLft: 2,
        intraMode: 1,
        intraSub: 1,
        intraTrn: 1
    });

    static create(options = {}) {
        return new uFuzzySearch(options);
    }

    static createTagSearcher(options = {}) {
        return new uFuzzySearch({
            ...this.tagSearchOptions,
            ...options
        });
    }

    static createFullSearcher(options = {}) {
        return new uFuzzySearch({
            ...this.defaultOptions,
            ...options
        });
    }

    static default = new uFuzzySearch();

    static search(haystack, needle, options) {
        return this.default.search(haystack, needle, options);
    }

    static filter(haystack, needle, options) {
        return this.default.filter(haystack, needle, options);
    }

    static sort(haystack, needle, options) {
        return this.default.sort(haystack, needle, options);
    }

    static slice(sorted, offset = 0, limit = null, options = {}) {
        options = ObjectUtil.guaranteeObject(options);

        if (sorted == null || sorted.total === 0) {
            return this._outputResult([], [], false, false, 0);
        }

        const total = sorted.total,
            safeOffset = Math.max(0, offset);

        const safeLimit = typeof limit === "number" && limit >= 0 ? limit : total - safeOffset,
            count = Math.max(0, Math.min(safeLimit, total - safeOffset));

        const infoThresh = options.infoThresh ?? 1000,
            hasInfo = sorted.info != null && count <= infoThresh;

        const results = Array(count),
            ranges = hasInfo ? Array(count) : [];

        const haystack = sorted.haystack;

        if (hasInfo && sorted.order != null) {
            const order = sorted.order,
                info = sorted.info;

            for (let i = 0; i < count; i++) {
                const infoInd = order[safeOffset + i],
                    haystackInd = info.idx[infoInd];

                results[i] = haystack[haystackInd];
                ranges[i] = info.ranges[infoInd];
            }
        } else {
            const inds = sorted.inds;

            for (let i = 0; i < count; i++) {
                const idx = inds[safeOffset + i];
                results[i] = haystack[idx];
            }
        }

        const oversized = safeOffset + count < total;
        return this._outputResult(results, ranges, oversized, hasInfo, total);
    }

    constructor(options = {}) {
        options = ObjectUtil.guaranteeObject(options);

        this.options = {
            ...uFuzzySearch.defaultOptions,
            ...options
        };

        this._uf = new uFuzzy(this.options);
    }

    search(haystack, needle, options) {
        haystack = ArrayUtil.guaranteeArray(haystack, null, true);
        options = ObjectUtil.guaranteeObject(options, "maxResults");

        const maxResults = options.maxResults ?? options.limit,
            offset = options.offset ?? 0;

        if (Util.empty(haystack)) {
            return uFuzzySearch._outputResult([], [], false, false, 0);
        }

        const sorted = this.sort(haystack, needle, options);

        if (sorted.total < 1) {
            return uFuzzySearch._outputResult([], [], false, false, 0);
        }

        return this.slice(sorted, offset, maxResults, options);
    }

    filter(haystack, needle, options = {}) {
        haystack = ArrayUtil.guaranteeArray(haystack, null, true);
        options = ObjectUtil.guaranteeObject(options);

        const searchKey = options.searchKey;

        if (Util.empty(haystack)) {
            return {
                haystack,
                searchHaystack: [],
                inds: null
            };
        }

        const searchHaystack = searchKey == null ? haystack : haystack.map(x => x[searchKey]),
            inds = this._uf.filter(searchHaystack, needle);

        return {
            haystack,
            searchHaystack,
            inds
        };
    }

    sort(haystack, needle, options = {}) {
        options = ObjectUtil.guaranteeObject(options);

        const filterRes = this.filter(haystack, needle, options),
            inds = filterRes.inds;

        if (Util.empty(inds)) {
            return {
                ...filterRes,
                info: null,
                order: null,
                total: 0
            };
        }

        const searchHaystack = filterRes.searchHaystack;

        const info = this._uf.info(inds, searchHaystack, needle),
            order = this._uf.sort(info, searchHaystack, needle);

        return {
            ...filterRes,
            info,
            order,
            total: inds.length
        };
    }

    slice(sorted, offset = 0, limit = null, options = {}) {
        return uFuzzySearch.slice(sorted, offset, limit, options);
    }

    static _outputResult(results, ranges, oversized, hasInfo, total) {
        const other = { oversized, hasInfo };

        if (typeof total === "number") {
            other.total = total;
        }

        return {
            results,
            ranges,

            other
        };
    }
}

export default uFuzzySearch;
