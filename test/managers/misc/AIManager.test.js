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

    test("refuses to load without a gemini key", async () => {
        await expect(createCommandRuntime({ config: { enableAI: true } })).rejects.toThrow("no Gemini API key");
    });

    test("loads its config, tools and an empty knowledge base", async () => {
        runtime = await createCommandRuntime({
            config: { enableAI: true },
            auth: { geminiKey: "test-key" }
        });

        const manager = runtime.client.aiManager;

        expect(manager.maxSteps).toBe(6);
        expect(manager.knowledge.kinds).toEqual([]);
        expect(manager.tools.finalName).toBe("final_response");
        expect(Array.from(manager.tools.tools.keys())).toEqual([
            "tri_search",
            "tag_get",
            "tag_call",
            "search_web",
            "fetch_web_page",
            "execute_javascript",
            "unit_convert",
            "find_users",
            "get_bot_profile",
            "get_asking_user",
            "inspect_image",
            "fetch_recent_messages",
            "search_messages",
            "http_request",
            "final_response"
        ]);
    });
});
