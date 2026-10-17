import { describe, expect, test, vi } from "vitest";

import "../../../setupGlobals.js";

import Util from "../../../src/util/Util.js";
import ConfigLoader from "../../../src/loaders/config/ConfigLoader.js";

describe("ConfigLoader", () => {
    test("clamps message limits and normalizes millisecond durations", () => {
        const loader = new ConfigLoader(null);

        const config = {
            outCharLimit: 999999,
            outLineLimit: -5,
            embedCharLimit: 999999,
            embedLineLimit: -1,
            commandRateLimit: 45,
            commandRateLimitWindow: 30,
            minResponseTime: 5500,
            globalTimeLimit: 2200,
            vmInspector: {
                connectTimeout: 2000,
                userConnectTimeout: 3000,
                userActionTimeout: 4000
            },
            vmHttp: {
                maxUploadSize: 10,
                maxDownloadSize: 20,
                maxRequests: 30,
                rateLimitWindow: 2,
                allowLocalhostRequests: false,
                allowFilesystemRequests: false
            },
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
        expect(config.commandRateLimit).toBe(45);
        expect(config.commandRateLimitWindow).toBe(30000);
        expect(config.minResponseTime).toBe(10000);
        expect(config.globalTimeLimit).toBe(2200000);
        expect(config.vmInspector.connectTimeout).toBe(2000000);
        expect(config.vmInspector.userConnectTimeout).toBe(3000000);
        expect(config.vmInspector.userActionTimeout).toBe(4000000);
        expect(config.vmHttp.maxUploadSize).toBe(10 * Util.dataBytes.megabyte);
        expect(config.vmHttp.maxDownloadSize).toBe(20 * Util.dataBytes.megabyte);
        expect(config.vmHttp.maxRequests).toBe(30);
        expect(config.vmHttp.rateLimitWindow).toBe(2000);
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
            vmInspector: {
                connectTimeout: 1000,
                userConnectTimeout: 1000,
                userActionTimeout: 1000
            },
            vmHttp: {
                maxUploadSize: 50,
                maxDownloadSize: 50,
                maxRequests: 20,
                rateLimitWindow: 1,
                allowLocalhostRequests: false,
                allowFilesystemRequests: false
            },
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
