import { describe, expect, test } from "vitest";

import Group from "../../../src/structures/permission/Group.js";
import User from "../../../src/structures/permission/User.js";

describe("Group", () => {
    test("filters users by group and formats output", () => {
        const group = new Group({ name: "mods*", level: 5 });
        const matchingUser = new User({ user: "100", group: "mods*", username: "Alex" });
        const otherUser = new User({ user: "200", group: "other", username: "Blake" });

        group.setUsers([matchingUser, otherUser]);

        expect(group.users).toEqual([matchingUser]);
        expect(group.format(true, false)).toBe('Group "mods*" - Level 5');
        expect(group.formatUsers(true, false)).toContain("Alex (100)");
        expect(group.formatUsers(false, true)).toContain("**mods\\***");
    });
});
