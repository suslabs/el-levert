import { describe, expect, test, vi } from "vitest";

vi.mock("../../src/LevertClient.js", () => ({
    getLogger: () => ({ warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() })
}));

import ModelRouter from "../../src/ai/ModelRouter.js";
import OpenRouterProvider from "../../src/ai/providers/OpenRouterProvider.js";

import Util from "../../src/util/Util.js";

const second = 1 / Util.durationSeconds.milli;

describe("ModelRouter", () => {
    test("skips remaining free models when an OpenRouter key hits an account free-tier limit", async () => {
        const http = {
            request: vi
                .fn()
                .mockResolvedValueOnce({
                    status: 429,
                    headers: {},
                    data: {
                        error: {
                            code: 429,
                            message: "Rate limit exceeded: free-models-per-day",
                            metadata: {
                                limit_source: "openrouter_free_tier_per_day",
                                headers: {
                                    "X-RateLimit-Reset": String(
                                        Date.now() + Util.durationSeconds.minute / Util.durationSeconds.milli
                                    )
                                }
                            }
                        }
                    }
                })
                .mockResolvedValueOnce({
                    status: 200,
                    headers: {},
                    data: { choices: [{ message: { content: "paid ok" }, finish_reason: "stop" }] }
                })
        };

        const provider = new OpenRouterProvider(http, ["sk-1"], { endpoint: "https://openrouter.test/api/v1" }),
            providers = new Map([["openrouter", provider]]);

        const models = [
            ModelRouter.parseModel("openrouter:vendor/a:free", ["openrouter"], "openrouter"),
            ModelRouter.parseModel("openrouter:vendor/b:free", ["openrouter"], "openrouter"),
            ModelRouter.parseModel("openrouter:vendor/paid", ["openrouter"], "openrouter")
        ];

        const router = new ModelRouter(http, providers, models, {
            modelCooldown: second,
            maxModelCooldown: 5 * second
        });
        const out = await router.generate(
            { contents: [{ role: "user", parts: [{ text: "hi" }] }] },
            router.createState()
        );

        expect(out.parts).toEqual([{ text: "paid ok" }]);
        expect(http.request).toHaveBeenCalledTimes(2);
        expect(http.request.mock.calls[1][0].data.model).toBe("vendor/paid");
        expect(router.quotas.isLimited("openrouter:free#0")).toBe(true);
    });
});
