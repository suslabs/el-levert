import uFuzzy from "@leeoniya/ufuzzy";

const uFuzzyOpts = {
    intraMode: 1,
    interIns: 3,
    intraChars: /[a-z]/
};

const uf = new uFuzzy(uFuzzyOpts);

function search(haystack, needle, maxResults) {
    const [_1, info, order] = uf.search(haystack, needle);

    const results = Array(order.length);

    for (let i = 0; i < order.length; i++) {
        const idx = info.idx[order[i]];
        results[i] = haystack[idx];
    }

    if (typeof maxResults !== "undefined") {
        return results.slice(0, maxResults);
    }

    return results;
}

export default search;
