import Group from "./Group.js";
import User from "./User.js";

const DisabledGroup = new Group({
    name: "disabled",
    level: 0
});

const ownerLevel = 2 ** 31 - 1,
    OwnerGroup = new Group({
        name: "owner",
        level: ownerLevel
    });

const OwnerUser = new User({
    group: "owner"
});

export { DisabledGroup, OwnerGroup, OwnerUser };
