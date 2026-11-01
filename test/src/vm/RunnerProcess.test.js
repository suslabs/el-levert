import { describe, expect, test } from "vitest";

import "../../../setupGlobals.js";

import RunnerProcess from "../../../src/vm/isolated-vm/RunnerProcess.js";

import Util from "@el-levert/common/util/Util.js";

describe("RunnerProcess", () => {
    test("initializes with default options", () => {
        const runner = new RunnerProcess();

        expect(runner.port).toBe(9123);
        expect(runner.host).toBe("127.0.0.1");
        expect(runner.isRunning).toBe(false);
    });

    test("accepts custom options", () => {
        const timeout = 10 / Util.durationSeconds.milli;

        const runner = new RunnerProcess({
            port: 9999,
            host: "0.0.0.0",
            startupTimeout: timeout
        });

        expect(runner.port).toBe(9999);
        expect(runner.host).toBe("0.0.0.0");
        expect(runner.startupTimeout).toBe(timeout);
    });

    test("isPortOpen returns false for unused port", async () => {
        const runner = new RunnerProcess({ port: 59123, host: "127.0.0.1" });
        const isOpen = await runner._isPortOpen();

        expect(isOpen).toBe(false);
    });
});

