import diceDist from "./diceDist.js";

function search(haystack, needle, minDist = 0.5, maxResults) {
    let distances = haystack.map(elem => [elem, diceDist(elem, needle)]);

    distances.sort((a, b) => b[1] - a[1]);
    distances = distances.filter(x => x[1] >= minDist);

    let results = distances.map(x => x[0]);

    if (typeof maxResults !== "undefined") {
        results = results.slice(0, maxResults);
    }

    return results;
}

export default search;
