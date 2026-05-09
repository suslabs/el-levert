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

    adminMsg = createCommandMessage("%perm check", {
        author: {
            id: "admin-user",
            username: "admin"
        }
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("perm check command", () => {
    test("reports permissions for self and other users", async () => {
        const command = getCommand(runtime, "perm");

        const selfOut = await executeCommand(command, "check", { msg: adminMsg });
        expect(selfOut.content).toContain("You have the following permissions");

        const otherOut = await executeCommand(command, "check alice", { msg: adminMsg });
        expect(otherOut.content).toContain("User `alice` has the following permissions");
    });
});
