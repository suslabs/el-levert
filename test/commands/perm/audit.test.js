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
let ownerMsg;

async function run(args, msg = adminMsg) {
    return await executeCommand(command, args, {
        msg
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

    ownerMsg = createCommandMessage("%perm", {
        author: {
            id: "owner-id",
            username: "owner"
        }
    });
}, 30000);

afterEach(async () => {
    await cleanupRuntime(runtime);
}, 30000);

describe("permission audit command", () => {
    test("shows help, compact entries, and revision details", async () => {
        const help = await run("audit help");
        expect(help.embeds[0].data.fields[0].value).toContain("View permission revisions");
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

    test("only lets the owner clear permission audit history", async () => {
        await run("add_group moderators 5");

        expect(await run("audit_clear")).toContain("Only the bot owner");
        expect(await run("audit-clear", ownerMsg)).toContain("Cleared 3 permission audit revisions");
        expect(await run("audit moderators --limit 5")).toContain("Found **no** permission revisions");
    });

    test("clears one permission subject without clearing another", async () => {
        await run("add_group moderators 5");
        await run("add_group helpers 4");

        expect(await run("audit_clear moderators", ownerMsg)).toContain("Cleared 1 permission audit revision");
        expect(await run("audit moderators --limit 5")).toContain("Found **no** permission revisions");
        expect(await run("audit helpers --limit 5")).not.toContain("Found **no** permission revisions");
    });

    test("does not register audit, audit_clear, or revert subcommands when enableAuditLog is false", async () => {
        const disabledRuntime = await createCommandRuntime({
                loadHandlers: true,
                config: {
                    enableAuditLog: false
                }
            }),
            disabledCmd = getCommand(disabledRuntime, "perm");

        try {
            const subcmds = disabledCmd.getSubcmds().map(cmd => cmd.name);
            expect(subcmds).not.toContain("audit");
            expect(subcmds).not.toContain("audit_clear");
            expect(subcmds).not.toContain("revert");
            expect(disabledCmd.getSubcmd("audit")).toBeNull();
            expect(disabledCmd.getSubcmd("audit_clear")).toBeNull();
            expect(disabledCmd.getSubcmd("revert")).toBeNull();
        } finally {
            await cleanupRuntime(disabledRuntime);
        }
    });
});
