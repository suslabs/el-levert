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

    adminMsg = createCommandMessage("%perm remove", {
        author: {
            id: "admin-user",
            username: "admin"
        }
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("perm remove command", () => {
    test("removes users from groups through the real permission manager", async () => {
        const command = getCommand(runtime, "perm");

        await expect(executeCommand(command, "remove mods alice", { msg: adminMsg })).resolves.toContain("Removed user");
        await expect(executeCommand(command, "remove mods alice", { msg: adminMsg })).resolves.toContain("is not in group");
    });
});
