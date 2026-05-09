import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addAdmin, cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;
let adminMsg;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
    await addAdmin(runtime);
    await runtime.client.permManager.addGroup("mods", 5, true);

    adminMsg = createCommandMessage("%perm add", {
        author: {
            id: "admin-user",
            username: "admin"
        }
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("perm add command", () => {
    test("adds users to groups through the real permission manager", async () => {
        const command = getCommand(runtime, "perm");

        await expect(executeCommand(command, "add mods alice", { msg: adminMsg })).resolves.toContain("Added user");
        await expect(executeCommand(command, "add mods alice", { msg: adminMsg })).resolves.toContain("already a part");
    });
});
