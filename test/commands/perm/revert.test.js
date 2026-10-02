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

describe("permission revert command", () => {
    test("restores a group and a membership from their revision history", async () => {
        await run("add_group moderators 5");
        await run("add moderators alice");

        const audit = await run("audit moderators --limit 10"),
            createRevision = audit.embeds[0].data.description.match(/#(\d+) \*\*create\*\* moderators/)[1];

        await run("update_group moderators helpers 6");

        expect(await run(`revert group helpers ${createRevision}`)).toContain("Reverted permission subject");
        expect(await runtime.client.permManager.fetchGroup("moderators")).toMatchObject({ level: 5 });
        expect(await runtime.client.permManager.fetchGroup("helpers")).toBeNull();

        await run("remove moderators alice");

        await run("audit alice-id/moderators --limit 10");

        const membershipRevision = (
            await runtime.client.permManager.audit({
                subject: "alice-id/moderators"
            })
        ).find(revision => revision.operation === "create").id;

        expect((await runtime.client.permManager.revisions.fetchRevision(membershipRevision)).snapshot).toEqual({
            user: "alice-id",
            group: "moderators"
        });

        expect(await run(`revert membership alice-id/moderators ${membershipRevision}`)).toContain(
            "Reverted permission subject"
        );
        expect(await runtime.client.permManager.isInGroup("moderators", "alice-id")).toBeTruthy();
        expect(await run(`revert membership alice-id/moderators ${membershipRevision}`)).toContain(
            "already in the requested state"
        );
    });

    test("disallows permission revert when enableAuditLog is false", async () => {
        runtime.client.config.enableAuditLog = false;

        await expect(
            runtime.client.permManager.revert({ target: "group", name: "moderators" }, 1, "admin-user")
        ).rejects.toThrow("Permission revisions are disabled");
    });
});
