import createEnum from "../createEnum.js";

const LeaderboardTypes = createEnum({
    count: "count",
    size: "size",
    uses: "uses",
    usage: "usage",
    user: "user"
});

export default LeaderboardTypes;
