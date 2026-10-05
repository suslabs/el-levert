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
        const usage = await run("audit -h");

        expect(help.embeds[0].data.fields[0].value).toContain("View recent tag revisions");
        expect(usage.embeds[0].data.fields[1].value).toContain("[tag_name] [revision_id] [--options]");
    });

    test("shows full audit log across all tags when called with no arguments", async () => {
        expect(await run("add alpha one", userMsg)).toContain("Created tag **alpha**");
        expect(await run("add beta two", userMsg)).toContain("Created tag **beta**");

        const audit = await run("audit");
        expect(audit.content).toContain("Tag audit page **1**");
        expect(audit.embeds[0].data.description).toContain("alpha");
        expect(audit.embeds[0].data.description).toContain("beta");
    });

    test("numbers revisions per-tag for a specific tag and globally for global audit", async () => {
        expect(await run("add alpha first", userMsg)).toContain("Created tag **alpha**");
        expect(await run("add beta second", userMsg)).toContain("Created tag **beta**");
        expect(await run("edit alpha third", userMsg)).toContain("Edited tag **alpha**");
        expect(await run("edit beta fourth", userMsg)).toContain("Edited tag **beta**");

        const alphaAudit = await run("audit alpha");
        expect(alphaAudit.embeds[0].data.description).toContain("#2 **update** alpha");
        expect(alphaAudit.embeds[0].data.description).toContain("#1 **create** alpha");

        const betaAudit = await run("audit beta");
        expect(betaAudit.embeds[0].data.description).toContain("#2 **update** beta");
        expect(betaAudit.embeds[0].data.description).toContain("#1 **create** beta");

        const globalAudit = await run("audit");
        expect(globalAudit.embeds[0].data.description).toContain("#4 **update** beta");
        expect(globalAudit.embeds[0].data.description).toContain("#3 **update** alpha");
        expect(globalAudit.embeds[0].data.description).toContain("#2 **create** beta");
        expect(globalAudit.embeds[0].data.description).toContain("#1 **create** alpha");

        const alphaDetail = await run("audit alpha 1");
        expect(alphaDetail.content).toContain("Revision **#1** for **alpha**");
        expect(alphaDetail.embeds[0].data.title).toContain("Revision #1 | alpha");

        const globalDetail = await run("audit 3");
        expect(globalDetail.content).toContain("Revision **#3** for **alpha**");
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

    test("inspects a revision directly by id without tag name", async () => {
        expect(await run("add alpha one", userMsg)).toContain("Created tag **alpha**");
        const audit = await run("audit alpha");
        const revisionId = Number(audit.embeds[0].data.description.match(/#(\d+)/)[1]);

        const detail = await run(`audit ${revisionId}`);
        expect(detail.content).toContain(`Revision **#${revisionId}**`);
        expect(detail.embeds[0].data.title).toContain("alpha");
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

    test("resets autoincrement sequence when full audit_clear is called", async () => {
        expect(await run("add alpha one", userMsg)).toContain("Created tag **alpha**");
        expect(await run("audit-clear", ownerMsg)).toContain("Cleared 1 tag audit revision");

        expect(await run("add beta test", userMsg)).toContain("Created tag **beta**");
        const audit = await run("audit beta");
        const revisionId = Number(audit.embeds[0].data.description.match(/#(\d+)/)[1]);
        expect(revisionId).toBe(1);
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
