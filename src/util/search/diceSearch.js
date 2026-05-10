import diceDist from "./diceDist.js";

import Util from "../Util.js";
import TypeTester from "../TypeTester.js";

const outputResult = (results, oversized) => ({
    results,

    other: { oversized }
});

function diceSearch(haystack, needle, options) {
    haystack = Array.isArray(haystack) ? haystack : [];
    options = TypeTester.isObject(options) ? options : {};

    const maxResults = options.maxResults,
        searchKey = options.searchKey;
    let minDist = options.minDist ?? 0.5;

    if (Util.empty(haystack)) {
        return outputResult([], false);
    }

    let distances = haystack.map((elem, i) => {
        const val = searchKey == null ? elem : elem[searchKey],
            dist = diceDist(val, needle);

        return [i, dist];
    });

    distances.sort((a, b) => b[1] - a[1]);

    if (minDist > 0) {
        distances = distances.filter(x => x[1] >= minDist);
    }

    const oversized = typeof maxResults === "number" && distances.length > maxResults,
        count = oversized ? maxResults : distances.length;

    const results = Array.from({ length: count }, (_, i) => haystack[distances[i][0]]);
    return outputResult(results, oversized);
}

export default diceSearch;
