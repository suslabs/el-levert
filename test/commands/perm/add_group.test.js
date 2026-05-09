import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addAdmin, cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;
let adminMsg;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
    await addAdmin(runtime);

    adminMsg = createCommandMessage("%perm add_group", {
        author: {
            id: "admin-user",
            username: "admin"
        }
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("perm add_group command", () => {
    test("creates groups through the real permission manager", async () => {
        const command = getCommand(runtime, "perm");

        await expect(executeCommand(command, "add_group", { msg: adminMsg })).resolves.toContain("group_name level");
        await expect(executeCommand(command, "add_group mods 20", { msg: adminMsg })).resolves.toContain(
            "higher than your own"
        );
        await expect(executeCommand(command, "add_group mods 5", { msg: adminMsg })).resolves.toContain("Added group");
        await expect(executeCommand(command, "add_group mods 5", { msg: adminMsg })).resolves.toContain("already exists");
    });
});
