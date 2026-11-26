import Ajv from "ajv";
import { describe, expect, test, vi } from "vitest";

import "../../../setupGlobals.js";

import Util from "../../../src/util/Util.js";
import ConfigLoader from "../../../src/loaders/config/ConfigLoader.js";
import config from "../../../config/config.json" assert { type: "json" };
import configSchema from "../../../src/config/schemas/config.schema.json" assert { type: "json" };

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
            reminderSendInterval: 3000,
            maxFileSize: 15
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
        expect(config.maxFileSize).toBe(15 * Util.dataBytes.megabyte);
    });

    test("clamps tag size, quota, and count limits while preserving -1 as unlimited", () => {
        const loader = new ConfigLoader(null);

        const config = {
            maxTagSize: {
                text: -1,
                script: -50,
                binary: 200
            },
            maxQuota: -1,
            maxTagCount: 100.4
        };

        loader.data = config;
        loader._modify();

        expect(config.maxTagSize.text).toBe(-1);
        expect(config.maxTagSize.script).toBe(-1);
        expect(config.maxTagSize.binary).toBe(200);
        expect(config.maxQuota).toBe(-1);
        expect(config.maxTagCount).toBe(100);

        const config2 = {
            maxQuota: -50,
            maxTagCount: -10
        };
        loader.data = config2;
        loader._modify();

        expect(config2.maxQuota).toBe(-1);
        expect(config2.maxTagCount).toBe(-1);

        const disabled = {
            maxFileSize: 0,
            commandRateLimit: -1,
            commandRateLimitWindow: 0,
            minResponseTime: 0,
            globalTimeLimit: -1,
            commandWaitTime: 0,
            vmInspector: {
                connectTimeout: 0,
                userConnectTimeout: -2,
                userActionTimeout: 0
            },
            vmHttp: {
                maxUploadSize: 0,
                maxDownloadSize: -1,
                maxRequests: 0,
                rateLimitWindow: 0
            },
            timeLimit: -5,
            otherTimeLimit: 0,
            reminderSendInterval: 0,
            ai: {
                timeLimit: 0,
                requestTimeout: -1,
                modelCooldown: 0,
                maxModelCooldown: -1,
                maxDownloadSize: 0,
                rateLimitWindow: -1
            }
        };
        loader.data = disabled;
        loader._modify();

        expect(disabled.maxFileSize).toBe(-1);
        expect(disabled.commandRateLimit).toBe(-1);
        expect(disabled.commandRateLimitWindow).toBe(-1);
        expect(disabled.minResponseTime).toBe(-1);
        expect(disabled.globalTimeLimit).toBe(-1);
        expect(disabled.commandWaitTime).toBe(-1);
        expect(disabled.vmInspector.connectTimeout).toBe(-1);
        expect(disabled.vmInspector.userConnectTimeout).toBe(-1);
        expect(disabled.vmInspector.userActionTimeout).toBe(-1);
        expect(disabled.vmHttp.maxUploadSize).toBe(-1);
        expect(disabled.vmHttp.maxDownloadSize).toBe(-1);
        expect(disabled.vmHttp.maxRequests).toBe(-1);
        expect(disabled.vmHttp.rateLimitWindow).toBe(-1);
        expect(disabled.timeLimit).toBe(-1);
        expect(disabled.otherTimeLimit).toBe(-1);
        expect(disabled.reminderSendInterval).toBe(-1);
        expect(disabled.ai.timeLimit).toBe(-1);
        expect(disabled.ai.requestTimeout).toBe(-1);
        expect(disabled.ai.modelCooldown).toBe(0);
        expect(disabled.ai.maxModelCooldown).toBe(-1);
        expect(disabled.ai.maxDownloadSize).toBe(-1);
        expect(disabled.ai.rateLimitWindow).toBe(-1);
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

    test("validates -1 or >= 1 constraints in config schema", () => {
        const ajv = new Ajv(),
            validate = ajv.compile(configSchema);

        expect(validate(structuredClone(config))).toBe(true);

        const cases = [
            data => (data.debugLogRetentionDays = 0),
            data => (data.maxTagSize.text = 0),
            data => (data.maxTagSize.script = -2),
            data => (data.maxTagSize.binary = 0),
            data => (data.maxQuota = 0),
            data => (data.maxTagCount = 0),
            data => (data.memLimit = 0),
            data => (data.ai.maxSteps = 0)
        ];

        for (const mutate of cases) {
            const invalid = structuredClone(config);
            mutate(invalid);
            expect(validate(invalid)).toBe(false);
        }

        const unlimited = structuredClone(config);
        unlimited.debugLogRetentionDays = -1;
        unlimited.maxTagSize = { text: -1, script: -1, binary: -1 };
        unlimited.maxQuota = -1;
        unlimited.maxTagCount = -1;
        unlimited.memLimit = -1;
        unlimited.ai.maxSteps = -1;
        unlimited.ai.modelCooldown = -1;
        unlimited.ai.maxModelCooldown = -1;
        unlimited.ai.maxRequests = -1;
        unlimited.ai.rateLimitWindow = -1;

        expect(validate(unlimited)).toBe(true);
    });
});
