import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
});

describe("loadBotConfig", () => {
    test("loads configs and auth together", async () => {
        vi.doMock("../../src/loaders/config/ConfigLoader.js", () => ({
            default: class ConfigLoader {
                constructor() {
                    this.name = "config";
                }

                async load() {
                    return [
                        {
                            cmdPrefix: "%"
                        },
                        1
                    ];
                }
            }
        }));
        vi.doMock("../../src/loaders/config/ReactionsLoader.js", () => ({
            default: class ReactionsLoader {
                constructor() {
                    this.name = "reactions";
                }

                async load() {
                    return [
                        {
                            enableReacts: false
                        },
                        1
                    ];
                }
            }
        }));
        vi.doMock("../../src/loaders/config/QuestbooksLoader.js", () => ({
            default: class QuestbooksLoader {
                constructor() {
                    this.name = "questbooks";
                }

                async load() {
                    return [{}, 1];
                }
            }
        }));
        vi.doMock("../../src/loaders/config/AuthLoader.js", () => ({
            default: class AuthLoader {
                async load() {
                    return [
                        {
                            token: "env-token",
                            owner: "env-owner"
                        },
                        1
                    ];
                }
            }
        }));

        const { loadBotConfig } = await import("../../src/config/loadConfig.js");
        const out = await loadBotConfig(console);

        expect(out).toEqual(
            expect.objectContaining({
                auth: {
                    token: "env-token",
                    owner: "env-owner"
                },
                configs: {
                    config: expect.any(Object),
                    reactions: expect.any(Object),
                    questbooks: {}
                }
            })
        );
    });
});
