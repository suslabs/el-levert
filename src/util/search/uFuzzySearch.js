import uFuzzy from "@leeoniya/ufuzzy";

const uFuzzyOpts = {
    intraMode: 1,
    interIns: 3,
    intraChars: /[a-z]/
};

const uf = new uFuzzy(uFuzzyOpts);

function search(haystack, needle, options = {}) {
    const { maxResults, searchKey } = options,
        infoThresh = options.infoThresh ?? 1000;

    let searchHaystack;

    if (searchKey == null) {
        searchHaystack = haystack;
    } else {
        searchHaystack = haystack.map(x => x[searchKey]);
    }

    const idxs = uf.filter(searchHaystack, needle);

    if (idxs == null || idxs.length === 0) {
        return [];
    }

    const count = typeof maxResults === "number" ? Math.min(maxResults, idxs.length) : idxs.length,
        results = Array(count);

    if (idxs.length <= infoThresh) {
        const info = uf.info(idxs, searchHaystack, needle),
            order = uf.sort(info, searchHaystack, needle);

        for (let i = 0; i < count; i++) {
            const idx = info.idx[order[i]];
            results[i] = haystack[idx];
        }
    } else {
        for (let i = 0; i < count; i++) {
            const idx = idxs[i];
            results[i] = haystack[idx];
        }
    }

    return results;
}

export default search;
