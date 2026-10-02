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

    ownerMsg = createCommandMessage("%tag", {
        author: {
            id: "owner-id",
            username: "owner"
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

        expect(help).toContain("View tag revisions");
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

    test("only lets the owner clear tag audit history", async () => {
        await run("add alpha one", userMsg);

        expect(await run("audit_clear")).toContain("Only the bot owner");
        expect(await run("audit-clear", ownerMsg)).toContain("Cleared 1 tag audit revision");
        expect(await run("audit alpha --limit 5")).toContain("Found **no** tag revisions");
    });

    test("clears a tag by revision range and date scope", async () => {
        await run("add alpha one", userMsg);
        await run("edit alpha two", userMsg);

        const audit = await run("audit alpha --limit 5"),
            ids = audit.embeds[0].data.description.match(/#(\d+)/g).map(value => Number(value.slice(1)));

        expect(await run(`audit_clear alpha ${ids[0]} ${ids[1]}`, ownerMsg)).toContain("Cleared 2 tag audit revisions");
        expect(await run("audit alpha --limit 5")).toContain("Found **no** tag revisions");

        await run("add beta one", userMsg);
        expect(await run('audit_clear beta --from "2000-01-01" --to "2100-01-01"', ownerMsg)).toContain(
            "Cleared 1 tag audit revision"
        );
        expect(await run("audit beta --limit 5")).toContain("Found **no** tag revisions");
    });

    test("does not register audit, audit_clear, or revert subcommands when enableAuditLog is false", async () => {
        const disabledRuntime = await createCommandRuntime({
                loadHandlers: true,
                config: {
                    enableAuditLog: false
                }
            }),
            disabledCmd = getCommand(disabledRuntime, "tag");

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
