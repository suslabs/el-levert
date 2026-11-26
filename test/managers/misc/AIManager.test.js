import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import AIEfforts from "../../../src/structures/ai/AIEfforts.js";

import { cleanupRuntime, createCommandRuntime } from "../../helpers/commandHarness.js";
import { createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;

afterEach(async () => {
    vi.doUnmock("../../../src/ai/browser/index.js");
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("AIManager", () => {
    test("isn't loaded when AI is disabled", { timeout: 10000 }, async () => {
        runtime = await createCommandRuntime({});
        expect(runtime.client.aiManager).toBeUndefined();
    });

    test("logs an error and marks AI unavailable when no AI key is provided", async () => {
        runtime = await createRuntime({ loadManagers: false, config: { enableAI: true } });

        const errorSpy = vi.spyOn(runtime.client.logger, "error"),
            { default: AIManager } = await import("../../../src/managers/misc/AIManager.js");

        const manager = new AIManager(true, {});
        await manager.load();

        expect(manager.enabled).toBe(false);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("geminiKey"));
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("no AI backend could be loaded"));

        runtime.client.aiManager = manager;
        runtime.client.managers = { aiManager: manager };
        runtime.client.components.set("manager", { collectionName: "managers", loaded: true });
        expect(runtime.client.checkComponent("managers", "aiManager", { throwErrors: false, altName: "AI" })).toBe(
            "AI isn't enabled"
        );
    });

    test("logs an error and marks AI unavailable when a prompt file is missing", async () => {
        const promptsPath = await fs.mkdtemp(path.join(os.tmpdir(), "ai-prompts-"));
        await fs.writeFile(path.join(promptsPath, "system.txt"), "You are a test assistant.");

        try {
            runtime = await createRuntime({
                loadManagers: false,
                config: { enableAI: true, ai: { promptsPath } },
                auth: { geminiKey: "test-key" }
            });

            const errorSpy = vi.spyOn(runtime.client.logger, "error"),
                { default: AIManager } = await import("../../../src/managers/misc/AIManager.js");

            const manager = new AIManager(true, { gemini: ["test-key"] });
            await manager.load();

            expect(manager.enabled).toBe(false);
            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining("prompt files are missing: triage, inspectImage")
            );
        } finally {
            await fs.rm(promptsPath, { recursive: true, force: true });
        }
    });

    test("logs an error and disables browser search when optional browser dependencies are unavailable", async () => {
        vi.doMock("../../../src/ai/browser/index.js", () => ({
            loadStealthBrowser: async () => null
        }));

        runtime = await createCommandRuntime({
            config: { enableAI: true },
            auth: { geminiKey: "test-key", keenableKey: "keen-key" }
        });

        const manager = runtime.client.aiManager;

        expect(manager.enabled).toBe(true);
        expect(manager.browser).toBeNull();
        expect(manager.webSearcher.backends.some(backend => backend.name === "browser")).toBe(false);

        await manager.unload();
        const errorSpy = vi.spyOn(runtime.client.logger, "error");
        await manager.load();

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"browser" search backend'));
    });

    test("marks search_web tool unavailable when WebSearcher has no backends", async () => {
        runtime = await createCommandRuntime({ config: { enableAI: true }, auth: { geminiKey: "test-key" } });

        const manager = runtime.client.aiManager,
            errorSpy = vi.spyOn(runtime.client.logger, "error");

        manager.webSearcher.backends = [];
        const tool = manager.tools.tools.get("search_web");

        expect(await tool.load(manager)).toBe(false);
        expect(tool.enabled).toBe(false);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"search_web" tool'));

        const { default: AISession } = await import("../../../src/ai/AISession.js");
        expect(manager.tools.get("search_web", new AISession({}))).toBeNull();
    });

    test("renders the configured pack name in the answer and triage prompts", async () => {
        const packName = "Example Craft: Expert";

        runtime = await createCommandRuntime({
            config: { enableAI: true, ai: { packName } },
            auth: { geminiKey: "test-key" }
        });

        const { prompt, triage } = runtime.client.aiManager;

        expect(prompt.instructions).toContain(packName);
        expect(triage.instructions).toContain(packName);
        expect(prompt.instructions).not.toContain("{{packName}}");
        expect(triage.instructions).not.toContain("{{packName}}");
    });

    test("offers quick questions only the tools that answer general facts and members", async () => {
        runtime = await createCommandRuntime({ config: { enableAI: true }, auth: { geminiKey: "test-key" } });

        const tools = runtime.client.aiManager.tools;

        const { default: AISession } = await import("../../../src/ai/AISession.js");
        const session = new AISession({});
        session.effort = AIEfforts.quick;

        expect(tools.getNames(session)).toEqual([
            "search_web",
            "fetch_web_page",
            "unit_convert",
            "find_users",
            "get_bot_profile",
            "get_asking_user",
            "inspect_image"
        ]);

        expect(tools.get("search_tags", session)).toBeNull();
        session.effort = AIEfforts.research;
        expect(tools.get("search_tags", session)).not.toBeNull();
    });

    test("fetches page text through the AI web tool", async () => {
        runtime = await createCommandRuntime({ config: { enableAI: true }, auth: { geminiKey: "test-key" } });

        const manager = runtime.client.aiManager;
        const url = "https://example.com/notes";
        const request = vi.spyOn(manager.http, "request").mockResolvedValue({
            status: 200,
            headers: { "content-type": "text/plain" },
            data: "First line. Second line."
        });

        const { default: AISession } = await import("../../../src/ai/AISession.js");
        const session = new AISession({});
        session.effort = AIEfforts.quick;

        const tool = manager.tools.get("fetch_web_page", session);
        const result = await tool.execute({ url }, session);

        expect(result).toMatchObject({ source: url, text: "First line. Second line." });
        expect(request).toHaveBeenCalledWith(expect.objectContaining({ url, responseType: "text" }));
    });

    test("loads the highest priority source of each type and falls back when one fails", async () => {
        runtime = await createCommandRuntime({ config: { enableAI: true }, auth: { geminiKey: "test-key" } });

        const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-docs-"));

        const file = async (name, text) => {
            const filePath = path.join(dir, name);
            await fs.writeFile(filePath, text);

            return filePath;
        };

        const { default: AISourceRegistry } = await import("../../../src/ai/sources/AISourceRegistry.js");
        const registry = new AISourceRegistry(runtime.client.aiManager.http, 1000);

        try {
            await registry.load({
                low: {
                    type: "scriptDocs",
                    priority: 1,
                    options: { name: "low", files: [await file("a.md", "## A\na")] }
                },
                high: {
                    type: "scriptDocs",
                    priority: 5,
                    options: { name: "high", files: [await file("b.md", "## B\nb")] }
                },
                broken: {
                    type: "gameDocs",
                    priority: 9,
                    options: { name: "broken", files: [path.join(dir, "missing.md")] }
                },
                backup: {
                    type: "gameDocs",
                    priority: 2,
                    options: { name: "backup", files: [await file("c.md", "## C\nc")] }
                }
            });

            expect(registry.get("scriptDocs").name).toBe("high");
            expect(registry.get("gameDocs").name).toBe("backup");
            expect(registry.get("recipes")).toBeNull();
        } finally {
            await fs.rm(dir, { recursive: true, force: true });
        }
    });

    test("loads its config and tools", async () => {
        runtime = await createCommandRuntime({
            config: { enableAI: true },
            auth: { geminiKey: "test-key" }
        });

        const manager = runtime.client.aiManager;

        expect(manager.maxSteps).toBe(6);
        expect(manager.prompt.instructions).toContain("[[EXTRAS]]");
        expect(manager.prompt.instructions).toContain("## ANSWER FORMAT");
        expect(manager.prompts.inspectImage).toContain("Describe this image");
        expect(Array.from(manager.tools.tools.keys())).toEqual([
            "search_tags",
            "tag_get",
            "tag_call",
            "search_quests",
            "read_quest",
            "search_recipes",
            "show_recipe",
            "search_wikipedia",
            "read_wikipedia",
            "search_gregtech_docs",
            "search_script_docs",
            "search_web",
            "fetch_web_page",
            "execute_javascript",
            "unit_convert",
            "overclock",
            "attach_file",
            "find_users",
            "get_bot_profile",
            "get_asking_user",
            "inspect_image",
            "show_image",
            "attach_image",
            "fetch_recent_messages",
            "search_messages",
            "http_request"
        ]);
    });
});
