const LeaderboardTypes = Object.freeze({
    count: "count",
    size: "size",
    uses: "uses",
    usage: "usage",
    user: "user"
});

const validLeaderboardTypes = new Set(Object.values(LeaderboardTypes));

export { LeaderboardTypes, validLeaderboardTypes };
