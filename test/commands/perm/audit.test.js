import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
    addAdmin,
    cleanupRuntime,
    createCommandMessage,
    createCommandRuntime,
    executeCommand,
    getCommand
} from "../../helpers/commandHarness.js";

let runtime;
let command;
let adminMsg;

async function run(args) {
    return await executeCommand(command, args, {
        msg: adminMsg
    });
}

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadHandlers: true
    });
    command = getCommand(runtime, "perm");

    await addAdmin(runtime);

    adminMsg = createCommandMessage("%perm", {
        author: {
            id: "admin-user",
            username: "admin"
        }
    });
}, 30000);

afterEach(async () => {
    await cleanupRuntime(runtime);
}, 30000);

describe("permission audit command", () => {
    test("shows help, compact entries, and revision details", async () => {
        expect(await run("audit help")).toContain("View permission revisions");
        expect(await run("audit")).toContain("[subject] [revision_id]");

        await run("add_group moderators 5");

        const audit = await run("audit moderators --limit 5"),
            revisionId = Number(audit.embeds[0].data.description.match(/#(\d+)/)[1]);

        expect(audit.embeds).toHaveLength(1);
        expect(audit.embeds[0].data.description).toContain("moderators");

        const detail = await run(`audit moderators ${revisionId}`);
        expect(detail.embeds).toHaveLength(1);
        expect(detail.embeds[0].data.description).toContain("Operation:");
        expect(detail.embeds[0].data.fields[0].name).toBe("name");
    });
});
