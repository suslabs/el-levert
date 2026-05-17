const LeaderboardTypes = Object.freeze({
    count: "count",
    size: "size",
    usage: "usage"
});

const validLeaderboardTypes = new Set(Object.values(LeaderboardTypes));

export { LeaderboardTypes, validLeaderboardTypes };
