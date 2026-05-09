import { describe, expect, test } from "vitest";
import getDefaultDiscordConfig from "../../../src/logger/discord/DefaultDiscordConfig.js";

describe("DefaultDiscordConfig", () => {
    test("builds a default level and winston format", () => {
        const config = getDefaultDiscordConfig("warn");

        expect(config.level).toBe("warn");
        expect(config.format).toBeDefined();
    });
});

describe("Merged Branch Coverage", () => {
    describe("DefaultDiscordConfig branches", () => {
        test("uses the fallback level when none is provided", () => {
            const config = getDefaultDiscordConfig();

            expect(config.level).toBe("info");
            expect(config.format).toBeDefined();
        });
    });
});
