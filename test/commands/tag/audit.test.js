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
let userMsg;
let adminMsg;

async function run(args, msg = adminMsg) {
    return await executeCommand(command, args, {
        msg
    });
}

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadHandlers: true
    });

    command = getCommand(runtime, "tag");

    await addAdmin(runtime);

    userMsg = createCommandMessage("%tag", {
        author: {
            id: "user-1",
            username: "alex"
        }
    });

    adminMsg = createCommandMessage("%tag", {
        author: {
            id: "admin-user",
            username: "admin"
        }
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag audit command", () => {
    test("shows compact audit entries and revision details", async () => {
        expect(await run("add alpha one", userMsg)).toContain("Created tag **alpha**");
        expect(await run("edit alpha two", userMsg)).toContain("Edited tag **alpha**");

        const audit = await run("audit alpha --limit 5");
        expect(audit).toContain("Tag audit page **1**");
        expect(audit).toContain("update **alpha**");
        expect(audit).toContain("user-1");

        const revisionId = Number(audit.match(/#(\d+)/)[1]),
            detail = await run(`audit alpha ${revisionId}`);

        expect(detail).toContain(`Revision **#${revisionId}**`);
        expect(detail).toContain("Operation:");
        expect(detail).toContain("body:");
    });

    test("handles empty audit pages", async () => {
        expect(await run("audit missing --limit 5")).toContain("Found **no** tag revisions");
    });
});
