import diceDist from "./diceDist.js";

const outputResult = (results, oversized) => ({
    results,

    other: { oversized }
});

function diceSearch(haystack, needle, options = {}) {
    let { maxResults, minDist, searchKey } = options;
    minDist ??= 0.5;

    let distances = haystack.map((elem, i) => {
        let val;

        if (searchKey == null) {
            val = elem;
        } else {
            val = elem[searchKey];
        }

        const dist = diceDist(val, needle);
        return [i, dist];
    });

    distances.sort((a, b) => b[1] - a[1]);

    if (minDist > 0) {
        distances = distances.filter(x => x[1] >= minDist);
    }

    const oversized = typeof maxResults === "number" && distances.length > maxResults,
        count = oversized ? maxResults : distances.length;

    const results = Array(count);

    for (let i = 0; i < count; i++) {
        results[i] = haystack[distances[i][0]];
    }

    return outputResult(results, oversized);
}

export default diceSearch;
