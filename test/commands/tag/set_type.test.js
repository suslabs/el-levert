import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { addAdmin, addTag, cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;
let msg;

beforeEach(async () => {
    runtime = await createCommandRuntime();
    await addAdmin(runtime);
    msg = createCommandMessage("%tag set_type", {
        author: {
            id: "admin-user",
            username: "admin"
        }
    });
    await addTag(runtime, "alpha", "body", "user-1");
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag set_type command", () => {
    test("updates tag versions through the real tag manager", async () => {
        const command = getCommand(runtime, "tag");

        await expect(executeCommand(command, "set_type alpha version old", { msg })).resolves.toContain("Updated tag");
        expect((await runtime.client.tagManager.fetch("alpha")).getVersion()).toBe("old");
    });
});

describe("Merged Branch Coverage", () => {
    let runtime;
    let msg;

    beforeEach(async () => {
        runtime = await createCommandRuntime();
        await addAdmin(runtime);

        msg = createCommandMessage("%tag set_type", {
            author: {
                id: "admin-user",
                username: "admin"
            }
        });

        await addTag(runtime, "alpha", "body", "user-1");
    });

    afterEach(async () => {
        await cleanupRuntime(runtime);
    });

    describe("tag set_type command branches", () => {
        test("covers help, command-name rejection, missing tags, and type/version failures", async () => {
            const command = getCommand(runtime, "tag");

            await expect(executeCommand(command, "set_type", { msg })).resolves.toContain("name (version/type)");
            await expect(executeCommand(command, "set_type list version old", { msg })).resolves.toContain("is a __command__");
            await expect(executeCommand(command, "set_type bad@name version old", { msg })).resolves.toContain("must consist");
            await expect(executeCommand(command, "set_type missing version old", { msg })).resolves.toContain("doesn't exist");
            await expect(executeCommand(command, "set_type alpha nonsense", { msg })).rejects.toThrow("Unknown type");

            const originalUpdateProps = runtime.client.tagManager.updateProps.bind(runtime.client.tagManager);
            runtime.client.tagManager.updateProps = async () => {
                const err = new Error("Update blocked");
                err.name = "TagError";
                throw err;
            };

            await expect(executeCommand(command, "set_type alpha version old", { msg })).resolves.toContain("Update blocked");

            runtime.client.tagManager.updateProps = originalUpdateProps;
            await expect(executeCommand(command, "set_type alpha vm2", { msg })).resolves.toContain("Updated tag");
            expect((await runtime.client.tagManager.fetch("alpha")).getType()).toBe("vm2");
        });
    });
});
