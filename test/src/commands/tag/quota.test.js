import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
    addTag,
    cleanupRuntime,
    createCommandMessage,
    createCommandRuntime,
    getCommand,
    executeCommand
} from "../../helpers/commandHarness.js";

let runtime;
let msg;

beforeEach(async () => {
    runtime = await createCommandRuntime();
    msg = createCommandMessage("%tag quota");
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag quota command", () => {
    test("reports the real stored quota usage", async () => {
        const command = getCommand(runtime, "tag");

        await expect(executeCommand(command, "quota", { msg })).resolves.toContain("have **no** tags");

        await addTag(runtime, "alpha", "body one", msg.author.id);
        const out = await executeCommand(command, "quota", { msg });

        expect(out).toContain("available storage");
        expect(out).toContain("kb");
    });
});

describe("Merged Branch Coverage", () => {
    let runtime;
    let msg;

    beforeEach(async () => {
        runtime = await createCommandRuntime();
        msg = createCommandMessage("%tag quota");
    });

    afterEach(async () => {
        await cleanupRuntime(runtime);
    });

    describe("tag quota branch coverage", () => {
        test("reports zero storage usage when tags exist but quota is empty", async () => {
            const command = getCommand(runtime, "tag");

            await addTag(runtime, "alpha", "body one", msg.author.id);
            runtime.client.tagManager.getQuota = async () => ({ quota: 0, count: 1 });

            await expect(executeCommand(command, "quota", { msg })).resolves.toContain(
                "aren't using any of the available storage"
            );
        });

        test("reports unlimited storage when maxQuota is -1", async () => {
            const command = getCommand(runtime, "tag");

            await addTag(runtime, "alpha", "body one", msg.author.id);
            runtime.client.tagManager.maxQuota = -1;

            const out = await executeCommand(command, "quota", { msg });
            expect(out).toContain("available storage");
            expect(out).toContain("(unlimited)");
            expect(out).toContain("across **1/");
            expect(out).not.toContain("%");
        });

        test("reports unlimited count when maxTagCount is -1", async () => {
            const command = getCommand(runtime, "tag");

            await addTag(runtime, "alpha", "body one", msg.author.id);
            runtime.client.tagManager.maxTagCount = -1;

            const out = await executeCommand(command, "quota", { msg });
            expect(out).toContain("across **1** tag");
            expect(out).not.toContain("across **1/");
        });
    });
});
