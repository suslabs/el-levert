import diceDist from "./diceDist.js";

const outputResult = (results, oversized) => ({
    results,

    other: { oversized }
});

function diceSearch(haystack, needle, options = {}) {
    let { maxResults, minDist, searchKey } = options;
    minDist ??= 0.5;

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
