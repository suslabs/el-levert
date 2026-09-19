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
    test("exposes command usage through the standard help arguments", async () => {
        const help = await run("audit help");
        const usage = await run("audit");

        expect(help).toContain("View recent tag revisions");
        expect(usage).toContain("[tag_name] [revision_id] [--options]");
    });

    test("shows compact audit entries and revision details", async () => {
        expect(await run("add alpha one", userMsg)).toContain("Created tag **alpha**");
        expect(await run("edit alpha two", userMsg)).toContain("Edited tag **alpha**");

        const audit = await run("audit alpha --limit 5");
        expect(audit.content).toContain("Tag audit page **1**");
        expect(audit.embeds).toHaveLength(1);
        expect(audit.embeds[0].data.description).toContain("**update** alpha");
        expect(audit.embeds[0].data.description).toContain("user-1");

        const revisionId = Number(audit.embeds[0].data.description.match(/#(\d+)/)[1]),
            detail = await run(`audit alpha ${revisionId}`);

        expect(detail.content).toContain(`Revision **#${revisionId}**`);
        expect(detail.embeds).toHaveLength(1);
        expect(detail.embeds[0].data.description).toContain("Operation:");
        expect(detail.embeds[0].data.fields[0].name).toBe("body");
    });

    test("handles empty audit pages", async () => {
        expect(await run("audit missing --limit 5")).toContain("Found **no** tag revisions");
    });
});
