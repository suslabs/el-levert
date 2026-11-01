import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
});

describe("loadAuth", () => {
    test("returns auth data when the auth loader succeeds", async () => {
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

        vi.resetModules();
        const { loadAuth } = await import("../../../src/config/loadConfig.js");

        await expect(loadAuth(console)).resolves.toEqual({
            token: "env-token",
            owner: "env-owner"
        });
    });

    test("returns null when auth loading fails", async () => {
        vi.doMock("../../src/loaders/config/AuthLoader.js", () => ({
            default: class AuthLoader {
                async load() {
                    return [null, 0];
                }
            }
        }));

        vi.resetModules();
        const { loadAuth } = await import("../../../src/config/loadConfig.js");

        await expect(loadAuth(console)).resolves.toBeNull();
    });
});
