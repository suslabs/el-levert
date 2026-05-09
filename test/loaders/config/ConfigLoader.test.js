import { describe, expect, test, vi } from "vitest";

import "../../../setupGlobals.js";

import ConfigLoader from "../../../src/loaders/config/ConfigLoader.js";

describe("ConfigLoader", () => {
    test("clamps message limits and normalizes millisecond durations", () => {
        const loader = new ConfigLoader(null);

        const config = {
            outCharLimit: 999999,
            outLineLimit: -5,
            embedCharLimit: 999999,
            embedLineLimit: -1,
            minResponseTime: 5500,
            globalTimeLimit: 2200,
            timeLimit: 800,
            otherTimeLimit: 1200,
            reminderSendInterval: 3000
        };

        loader.data = config;
        loader._modify();

        expect(config.outCharLimit).toBeGreaterThan(0);
        expect(config.outLineLimit).toBe(0);
        expect(config.embedCharLimit).toBeGreaterThan(0);
        expect(config.embedLineLimit).toBe(0);
        expect(config.minResponseTime).toBe(10000);
        expect(config.globalTimeLimit).toBe(2200000);
        expect(config.timeLimit).toBe(800000);
        expect(config.otherTimeLimit).toBe(1200000);
        expect(config.reminderSendInterval).toBe(3000000);
    });

    test("normalizes bridge bot formats into runtime regex config", () => {
        const logger = {
            warn: vi.fn()
        };
        const loader = new ConfigLoader(logger);

        const config = {
            outCharLimit: 10,
            outLineLimit: 10,
            embedCharLimit: 10,
            embedLineLimit: 10,
            minResponseTime: 10000,
            globalTimeLimit: 1000,
            timeLimit: 1000,
            otherTimeLimit: 1000,
            reminderSendInterval: 1000,
            bridgeBotIds: ["good", "bad"],
            bridgeBotMessageFormats: {
                good: ["bridge (?<content>)", "relay (?<content>)"],
                bad: "bridge content"
            }
        };

        loader.data = config;
        loader._modify();

        expect(config.useBridgeBot).toBe(true);
        expect(config.individualBridgeBotFormats).toBe(true);
        expect(config.bridgeBotIds).toEqual(["good"]);
        expect(config.bridgeBotExps).toBeInstanceOf(Map);
        expect(config.bridgeBotExps.get("good")).toBeInstanceOf(RegExp);
        expect(config.bridgeBotExps.get("good").source).toContain("content1");
        expect(config.bridgeBotExps.get("good").source).toContain("content2");
        expect(logger.warn).toHaveBeenCalledWith('No/invalid regex for bot "bad".');
    });
});
