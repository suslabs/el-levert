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

async function run(args, msg = userMsg) {
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

describe("tag revert command", () => {
    test("lets users revert their latest edit once", async () => {
        expect(await run("add alpha one")).toContain("Created tag **alpha**");
        expect(await run("edit alpha two")).toContain("Edited tag **alpha**");
        expect(await run("revert alpha")).toContain("Reverted tag **alpha**");

        const tag = await runtime.client.tagManager.fetch("alpha");
        expect(tag.body).toBe("one");
        expect(await run("revert alpha")).toContain("already been reverted");
    });

    test("lets mods restore a specific revision", async () => {
        expect(await run("add alpha one")).toContain("Created tag **alpha**");
        expect(await run("edit alpha two")).toContain("Edited tag **alpha**");

        const audit = await run("audit alpha", adminMsg),
            revisionId = Number(audit.match(/#(\d+)/)[1]);

        expect(await run("edit alpha three")).toContain("Edited tag **alpha**");
        expect(await run(`revert alpha ${revisionId}`, adminMsg)).toContain("Reverted tag **alpha**");

        const tag = await runtime.client.tagManager.fetch("alpha");
        expect(tag.body).toBe("two");
    });
});
