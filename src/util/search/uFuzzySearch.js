import uFuzzy from "@leeoniya/ufuzzy";

const uFuzzyOpts = {
    alpha: "a-z"
};

const uf = new uFuzzy(uFuzzyOpts);

const outputResult = (results, ranges, oversized, hasInfo) => ({
    results,
    ranges,

    other: { oversized, hasInfo }
});

function uFuzzySearch(haystack, needle, options = {}) {
    const { maxResults, searchKey } = options,
        infoThresh = options.infoThresh ?? 1000;

    const searchHaystack = searchKey == null ? haystack : haystack.map(x => x[searchKey]),
        inds = uf.filter(searchHaystack, needle);

    if (inds === null || inds.length === 0) {
        return outputResult([], [], false);
    }

    const oversized = typeof maxResults === "number" && inds.length > maxResults,
        count = oversized ? maxResults : inds.length,
        hasInfo = count <= infoThresh;

    const results = Array(count),
        ranges = hasInfo ? Array(count) : [];

    if (hasInfo) {
        const info = uf.info(inds, searchHaystack, needle),
            order = uf.sort(info, searchHaystack, needle);

        for (let i = 0; i < count; i++) {
            const infoInd = order[i],
                haystackInd = info.idx[infoInd];

            results[i] = haystack[haystackInd];
            ranges[i] = info.ranges[infoInd];
        }
    } else {
        for (let i = 0; i < count; i++) {
            const idx = inds[i];
            results[i] = haystack[idx];
        }
    }

    return outputResult(results, ranges, oversized, hasInfo);
}

export default uFuzzySearch;
