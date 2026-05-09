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

    adminMsg = createCommandMessage("%perm update_group", {
        author: {
            id: "admin-user",
            username: "admin"
        }
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("perm update_group command", () => {
    test("updates groups through the real permission manager", async () => {
        const command = getCommand(runtime, "perm");

        await expect(executeCommand(command, "update_group mods unchanged unchanged", { msg: adminMsg })).resolves.toContain(
            "No group changes provided"
        );
        await expect(executeCommand(command, "update_group mods helpers 6", { msg: adminMsg })).resolves.toContain(
            "Updated group"
        );
    });
});
