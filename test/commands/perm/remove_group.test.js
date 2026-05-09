import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addAdmin, cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;
let adminMsg;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
    await addAdmin(runtime);
    await runtime.client.permManager.addGroup("helpers", 6, true);

    adminMsg = createCommandMessage("%perm remove_group", {
        author: {
            id: "admin-user",
            username: "admin"
        }
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("perm remove_group command", () => {
    test("removes groups through the real permission manager", async () => {
        const command = getCommand(runtime, "perm");
        await expect(executeCommand(command, "remove_group helpers", { msg: adminMsg })).resolves.toContain("Removed group");
    });
});
