import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addAdmin, cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;
let adminMsg;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
    await addAdmin(runtime);

    const mods = await runtime.client.permManager.addGroup("mods", 5, true);
    await runtime.client.permManager.add(mods, "alice-id", true);

    adminMsg = createCommandMessage("%perm remove_all", {
        author: {
            id: "admin-user",
            username: "admin"
        }
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("perm remove_all command", () => {
    test("removes all permissions for a user", async () => {
        const command = getCommand(runtime, "perm");

        await expect(executeCommand(command, "remove_all alice", { msg: adminMsg })).resolves.toContain("Removed `alice`");
        await expect(executeCommand(command, "remove_all alice", { msg: adminMsg })).resolves.toContain(
            "doesn't have any permissions"
        );
    });
});
