import diceDist from "./diceDist.js";

function search(haystack, needle, options = {}) {
    let { maxResults, minDist, searchKey } = options;
    minDist ??= 0.5;

    let distances = haystack.map((elem, i) => {
        let val;

        if (typeof searchKey === "undefined") {
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

    let results = distances.map(x => {
        const ind = x[0];
        return haystack[ind];
    });

    const limitResults = ![undefined, null, Infinity].includes(maxResults);

    if (limitResults) {
        results = results.slice(0, maxResults);
    }

    return results;
}

export default search;
