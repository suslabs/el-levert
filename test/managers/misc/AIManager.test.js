import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createCommandRuntime } from "../../helpers/commandHarness.js";

let runtime;

afterEach(async () => {
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("AIManager", () => {
    test("isn't loaded when AI is disabled", async () => {
        runtime = await createCommandRuntime({});
        expect(runtime.client.aiManager).toBeUndefined();
    });

    test("refuses to load without any AI key", async () => {
        await expect(createCommandRuntime({ config: { enableAI: true } })).rejects.toThrow("no API key was provided");
    });

    test("refuses to load when a prompt file is missing", async () => {
        const promptsPath = await fs.mkdtemp(path.join(os.tmpdir(), "ai-prompts-"));
        await fs.writeFile(path.join(promptsPath, "system.txt"), "You are a test assistant.");

        try {
            await expect(
                createCommandRuntime({
                    config: { enableAI: true, ai: { promptsPath } },
                    auth: { geminiKey: "test-key" }
                })
            ).rejects.toThrow("Missing AI prompt files: triage, inspectImage");
        } finally {
            await fs.rm(promptsPath, { recursive: true, force: true });
        }
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
