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

    adminMsg = createCommandMessage("%perm list", {
        author: {
            id: "admin-user",
            username: "admin"
        }
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("perm list command", () => {
    test("lists registered permissions from the real database", async () => {
        const command = getCommand(runtime, "perm");
        const out = await executeCommand(command, "list", { msg: adminMsg });

        expect(out.content).toContain("Registered permissions");
        expect(out.embeds).toHaveLength(1);
    });
});
