import { describe, expect, test } from "vitest";

import User from "../../../src/structures/permission/User.js";

describe("User", () => {
    test("updates identifiers and renders missing usernames", () => {
        const user = new User({ user: "200", group: "other", username: "Blake" });

        user.setUsername(null);
        user.setUserId("201");
        user.setGroup("mods*");

        expect(user.user).toBe("201");
        expect(user.group).toBe("mods*");
        expect(user.format(false)).toBe("NOT FOUND (201)");
    });

    test("formats usernames with discord-style code formatting", () => {
        const user = new User({ user: "100", group: "mods*", username: "Alex" });
        expect(user.format(true)).toBe("Alex (`100`)");
    });
});
