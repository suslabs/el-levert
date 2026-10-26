import uFuzzy from "@leeoniya/ufuzzy";

import Util from "../Util.js";
import ArrayUtil from "../ArrayUtil.js";
import ObjectUtil from "../ObjectUtil.js";

const defaultUFuzzyOptions = Object.freeze({
    alpha: "a-z"
});

function outputResult(results, ranges, oversized, hasInfo, total) {
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

function slice(sorted, offset = 0, limit = null, options = {}) {
    options = ObjectUtil.guaranteeObject(options);

    if (sorted == null || sorted.total === 0) {
        return outputResult([], [], false, false, 0);
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
    return outputResult(results, ranges, oversized, hasInfo, total);
}

function createuFuzzySearch(options = {}) {
    options = ObjectUtil.guaranteeObject(options);

    const uFuzzyOptions = Object.freeze({
        ...defaultUFuzzyOptions,
        ...options
    });

    const uf = new uFuzzy(uFuzzyOptions);

    function filter(haystack, needle, filterOptions = {}) {
        haystack = ArrayUtil.guaranteeArray(haystack, null, true);
        filterOptions = ObjectUtil.guaranteeObject(filterOptions);

        const searchKey = filterOptions.searchKey;

        if (Util.empty(haystack)) {
            return {
                haystack,
                searchHaystack: [],
                inds: null
            };
        }

        const searchHaystack = searchKey == null ? haystack : haystack.map(x => x[searchKey]),
            inds = uf.filter(searchHaystack, needle);

        return {
            haystack,
            searchHaystack,
            inds
        };
    }

    function sort(haystack, needle, sortOptions = {}) {
        sortOptions = ObjectUtil.guaranteeObject(sortOptions);

        const filterRes = filter(haystack, needle, sortOptions),
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

        const info = uf.info(inds, searchHaystack, needle),
            order = uf.sort(info, searchHaystack, needle);

        return {
            ...filterRes,
            info,
            order,
            total: inds.length
        };
    }

    function search(haystack, needle, searchOptions) {
        haystack = ArrayUtil.guaranteeArray(haystack, null, true);
        searchOptions = ObjectUtil.guaranteeObject(searchOptions, "maxResults");

        const maxResults = searchOptions.maxResults ?? searchOptions.limit,
            offset = searchOptions.offset ?? 0;

        if (Util.empty(haystack)) {
            return outputResult([], [], false, false, 0);
        }

        const sorted = sort(haystack, needle, searchOptions);

        if (sorted.total < 1) {
            return outputResult([], [], false, false, 0);
        }

        return slice(sorted, offset, maxResults, searchOptions);
    }

    return Object.freeze({
        options: uFuzzyOptions,
        uf,
        search,
        filter,
        sort,
        slice
    });
}

createuFuzzySearch.defaultOptions = defaultUFuzzyOptions;
createuFuzzySearch.create = createuFuzzySearch;
createuFuzzySearch.slice = slice;

export default createuFuzzySearch;
