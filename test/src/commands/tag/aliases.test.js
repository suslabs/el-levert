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
    msg = createCommandMessage("%tag aliases");
    await addTag(runtime, "alpha", "target body", msg.author.id);
}, 30000);

afterEach(async () => {
    await cleanupRuntime(runtime);
}, 30000);

describe("tag aliases command", () => {
    test("returns warning for non-existent tag", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "aliases nonexistent", { msg });

        expect(out).toContain("Tag **nonexistent** doesn't exist.");
    });

    test("returns warning for invalid tag name", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "aliases invalid!name", { msg });

        expect(out).toContain("The tag name must consist of Latin characters, numbers, _ or -.");
    });

    test("prevents manipulating commands", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "aliases add", { msg });

        expect(out).toContain("is a __command__, not a __tag__");
    });

    test("returns no aliases when a tag has no aliases pointing to it", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "aliases alpha", { msg });

        expect(out).toContain("Tag **alpha** has **no** aliases.");
    });

    test("returns single alias when one alias exists", async () => {
        const command = getCommand(runtime, "tag");
        await executeCommand(command, "alias beta alpha", { msg });

        const out = await executeCommand(command, "aliases alpha", { msg });
        expect(out).toContain("Tag **alpha** has **1** alias: **beta**");
    });

    test("returns multiple aliases sorted alphabetically", async () => {
        const command = getCommand(runtime, "tag");
        await executeCommand(command, "alias zebra alpha", { msg });
        await executeCommand(command, "alias beta alpha", { msg });

        const out = await executeCommand(command, "aliases alpha", { msg });
        expect(out).toContain("Tag **alpha** has **2** aliases: **beta**, **zebra**");
    });

    test("formats alias default arguments", async () => {
        const command = getCommand(runtime, "tag");
        await executeCommand(command, "alias beta alpha default_value", { msg });

        const out = await executeCommand(command, "aliases alpha", { msg });
        expect(out).toContain("Tag **alpha** has **1** alias: **beta** (args: `default_value`)");
    });

    test("formats hidden aliases", async () => {
        const command = getCommand(runtime, "tag");
        await executeCommand(command, "alias beta alpha", { msg });

        const aliasTag = await runtime.client.tagManager.fetch("beta");
        await runtime.client.tagManager.hide(aliasTag);

        const out = await executeCommand(command, "aliases alpha", { msg });
        expect(out).toContain("Tag **alpha** has **1** alias: **beta** *(hidden)*");
    });

    test("escapes markdown characters in alias names", async () => {
        const command = getCommand(runtime, "tag");
        await executeCommand(command, "alias under_score alpha", { msg });

        const out = await executeCommand(command, "aliases alpha", { msg });
        expect(out).toContain("Tag **alpha** has **1** alias: **under\\_score**");
    });

    test("tagManager.fetchAliases and fetchUsage return null or throw TagError when validate is true", async () => {
        expect(await runtime.client.tagManager.fetchAliases("nonexistent")).toBeNull();
        await expect(runtime.client.tagManager.fetchAliases("nonexistent", true)).rejects.toThrow("Tag doesn't exist");

        expect(await runtime.client.tagManager.fetchUsage("nonexistent")).toBeNull();
        await expect(runtime.client.tagManager.fetchUsage("nonexistent", true)).rejects.toThrow("Tag doesn't exist");

        const command = getCommand(runtime, "tag");
        await executeCommand(command, "alias beta alpha", { msg });
        await executeCommand(command, "alias gamma alpha", { msg });

        const managerAliases = await runtime.client.tagManager.fetchAliases("alpha");
        expect(managerAliases).toHaveLength(2);
        expect(managerAliases.map(a => a.name)).toEqual(["beta", "gamma"]);

        const alphaTag = await runtime.client.tagManager.fetch("alpha");
        const tagAliases = await alphaTag.getAliases();
        expect(tagAliases).toHaveLength(2);
        expect(tagAliases.map(a => a.name)).toEqual(["beta", "gamma"]);
    });

    test("attaches file when aliases exceed maxInlineLimit", async () => {
        const command = getCommand(runtime, "tag");

        for (let i = 0; i < 21; i++) {
            await executeCommand(command, `alias alias_${String(i).padStart(2, "0")} alpha`, { msg });
        }

        const out = await executeCommand(command, "aliases alpha", { msg });
        expect(out).toHaveProperty("content");
        expect(out.content).toContain("Tag **alpha** has **21** aliases:");
        expect(out).toHaveProperty("files");
        expect(out.files).toHaveLength(1);
        expect(out.files[0].attachment.toString()).toContain("alias_00");
    });

    test("recursively resolves deep aliases stopping at bound args", async () => {
        const command = getCommand(runtime, "tag");
        await executeCommand(command, "alias beta alpha", { msg });
        await executeCommand(command, "alias gamma beta", { msg });
        await executeCommand(command, "alias delta gamma bound_val", { msg });
        await executeCommand(command, "alias epsilon delta", { msg });

        const outAlpha = await executeCommand(command, "aliases alpha", { msg });
        expect(outAlpha).toContain(
            "Tag **alpha** has **3** aliases: **beta**, **delta** (args: `bound_val`), **gamma**"
        );

        const outDelta = await executeCommand(command, "aliases delta", { msg });
        expect(outDelta).toContain("Tag **delta** has **1** alias: **epsilon**");
    });

    test("tagManager.fetchAlias and fetchAliases support forward resolution and backward collection with bound args semantic", async () => {
        const command = getCommand(runtime, "tag");
        await executeCommand(command, "alias beta alpha", { msg });
        await executeCommand(command, "alias gamma beta", { msg });
        await executeCommand(command, "alias delta gamma bound_val", { msg });
        await executeCommand(command, "alias epsilon delta", { msg });

        const backwardAlpha = await runtime.client.tagManager.fetchAliases("alpha");
        expect(backwardAlpha.map(a => a.name)).toEqual(["beta", "delta", "gamma"]);

        const backwardDelta = await runtime.client.tagManager.fetchAliases("delta");
        expect(backwardDelta.map(a => a.name)).toEqual(["epsilon"]);

        const forwardEpsilon = await runtime.client.tagManager.fetchAlias(
            await runtime.client.tagManager.fetch("epsilon")
        );
        expect(forwardEpsilon.name).toBe("epsilon");
        expect(forwardEpsilon.hops).toEqual(["epsilon", "delta", "gamma", "beta", "alpha"]);
        expect(forwardEpsilon.args).toBe("bound_val");
        expect(forwardEpsilon._usageName).toBe("delta");

        const forwardEpsilonBase = await runtime.client.tagManager.fetchAlias(
            await runtime.client.tagManager.fetch("epsilon"),
            false
        );
        expect(forwardEpsilonBase.name).toBe("alpha");

        const forwardGamma = await runtime.client.tagManager.fetchAlias(await runtime.client.tagManager.fetch("gamma"));
        expect(forwardGamma.name).toBe("gamma");
        expect(forwardGamma._usageName).toBe("alpha");

        await expect(runtime.client.tagManager.fetchAliases("nonexistent", true)).rejects.toThrow("Tag doesn't exist");

        await executeCommand(command, "alias my_pipe pipe", { msg });

        const backwardPipe = await runtime.client.tagManager.fetchAliases("pipe");
        expect(backwardPipe.map(a => a.name)).toEqual(["my_pipe"]);

        const forwardPipe = await runtime.client.tagManager.fetchAlias(
            await runtime.client.tagManager.fetch("my_pipe")
        );
        expect(forwardPipe.isFake).toBe(true);
        expect(forwardPipe.name).toBe("my_pipe");
        expect(forwardPipe.hops).toEqual(["my_pipe", "pipe"]);
    });
});
