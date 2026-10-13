import { afterEach, beforeEach, describe, expect, test } from "vitest";

import Tag from "../../../src/structures/tag/Tag.js";

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
    test("exposes command usage through the standard help arguments", async () => {
        const help = await run("revert -h");
        const usage = await run("revert");

        expect(help.embeds[0].data.fields[0].value).toContain("Restores a tag to a previous revision");
        expect(usage).toContain("<name> [revision_id]");
    });

    test("lets users revert their latest edit once", async () => {
        expect(await run("add alpha one")).toContain("Created tag **alpha**");
        expect(await run("edit alpha two")).toContain("Edited tag **alpha**");
        expect(await run("revert alpha")).toContain("Reverted tag **alpha** to revision **#1**");

        const tag = await runtime.client.tagManager.fetch("alpha");
        expect(tag.body).toBe("one");
        expect(await run("revert alpha")).toContain("already been reverted");
    });

    test("reverts a rename back to old name with proper message", async () => {
        expect(await run("add alpha one")).toContain("Created tag **alpha**");
        expect(await run("rename alpha beta")).toContain("Renamed tag **alpha** to **beta**");
        const revRes = await run("revert beta");
        expect(revRes).toContain("Reverted tag **beta** to **alpha**");

        expect(await runtime.client.tagManager.fetch("alpha")).not.toBeNull();
        expect(await runtime.client.tagManager.fetch("beta")).toBeNull();
    });

    test("reverts a rename back to old name when reverting via old name", async () => {
        expect(await run("add alpha one")).toContain("Created tag **alpha**");
        expect(await run("rename alpha beta")).toContain("Renamed tag **alpha** to **beta**");
        const revRes = await run("revert alpha");
        expect(revRes).toContain("Reverted tag **beta** to **alpha**");

        expect(await runtime.client.tagManager.fetch("alpha")).not.toBeNull();
        expect(await runtime.client.tagManager.fetch("beta")).toBeNull();
    });

    test("blocks reverting rename if old name is already taken", async () => {
        expect(await run("add alpha one")).toContain("Created tag **alpha**");
        expect(await run("rename alpha beta")).toContain("Renamed tag **alpha** to **beta**");
        expect(await run("add alpha new_tag")).toContain("Created tag **alpha**");

        const revRes = await run("revert beta");
        expect(revRes).toContain("already exists");
    });

    test("prevents users from reverting actions taken upon their tags by others", async () => {
        expect(await run("add alpha one")).toContain("Created tag **alpha**");
        expect(await run("edit alpha admin_edit", adminMsg)).toContain("Edited tag **alpha**");

        const revRes = await run("revert alpha", userMsg);
        expect(revRes).toContain("You can only revert your own actions");
    });

    test("lets mods restore a specific revision", async () => {
        expect(await run("add alpha one")).toContain("Created tag **alpha**");
        expect(await run("edit alpha two")).toContain("Edited tag **alpha**");

        const audit = await run("audit alpha", adminMsg),
            revisionId = Number(audit.embeds[0].data.description.match(/#(\d+)/)[1]);

        expect(await run("edit alpha three")).toContain("Edited tag **alpha**");
        expect(await run(`revert alpha ${revisionId}`, adminMsg)).toContain("Reverted tag **alpha**");

        const tag = await runtime.client.tagManager.fetch("alpha");
        expect(tag.body).toBe("two");
    });

    test("reverts a rename of an unversioned tag by new name and old name", async () => {
        await runtime.client.tagManager.tag_db.quotaCreate("user-1");
        await runtime.client.tagManager.tag_db.add(
            new Tag({
                name: "unvold",
                body: "body",
                owner: "user-1"
            })
        );

        expect(await run("rename unvold unvnew")).toContain("Renamed tag **unvold** to **unvnew**");
        const revRes = await run("revert unvnew");
        expect(revRes).toContain("Reverted tag **unvnew** to **unvold**");

        expect(await runtime.client.tagManager.fetch("unvold")).not.toBeNull();
        expect(await runtime.client.tagManager.fetch("unvnew")).toBeNull();
    });

    test("reverts a rename of an unversioned tag when using old name", async () => {
        await runtime.client.tagManager.tag_db.quotaCreate("user-1");
        await runtime.client.tagManager.tag_db.add(
            new Tag({
                name: "unvold2",
                body: "body",
                owner: "user-1"
            })
        );

        expect(await run("rename unvold2 unvnew2")).toContain("Renamed tag **unvold2** to **unvnew2**");
        const revRes = await run("revert unvold2");
        expect(revRes).toContain("Reverted tag **unvnew2** to **unvold2**");

        expect(await runtime.client.tagManager.fetch("unvold2")).not.toBeNull();
        expect(await runtime.client.tagManager.fetch("unvnew2")).toBeNull();
    });

    test("reverts an unversioned tag edit and delete", async () => {
        await runtime.client.tagManager.tag_db.quotaCreate("user-1");
        await runtime.client.tagManager.tag_db.add(
            new Tag({
                name: "unvedit",
                body: "original",
                owner: "user-1"
            })
        );

        expect(await run("edit unvedit changed")).toContain("Edited tag **unvedit**");
        expect(await run("revert unvedit")).toContain("Reverted tag **unvedit**");

        const tag = await runtime.client.tagManager.fetch("unvedit");
        expect(tag.body).toBe("original");

        expect(await run("delete unvedit")).toContain("Deleted tag **unvedit**");
        expect(await run("revert unvedit")).toContain("Reverted tag **unvedit**");
        expect(await runtime.client.tagManager.fetch("unvedit")).not.toBeNull();
    });
});
