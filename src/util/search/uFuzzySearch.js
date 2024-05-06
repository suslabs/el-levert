import uFuzzy from "@leeoniya/ufuzzy";

const uFuzzyOpts = {
    intraMode: 1,
    interIns: 3,
    intraChars: /[a-z]/
};

const uf = new uFuzzy(uFuzzyOpts);

function search(haystack, needle, options = {}) {
    const { maxResults, searchKey } = options;

    let searchHaystack;

    if (typeof searchKey === "undefined") {
        searchHaystack = haystack;
    } else {
        searchHaystack = haystack.map(x => x[searchKey]);
    }

    const [_, info, order] = uf.search(searchHaystack, needle);

    let results = Array(order.length);

    for (let i = 0; i < order.length; i++) {
        const ind = info.idx[order[i]];
        results[i] = haystack[ind];
    }

    const limitResults = ![undefined, null, Infinity].includes(maxResults);

    if (limitResults) {
        results = results.slice(0, maxResults);
    }

    return results;
}

export default search;
