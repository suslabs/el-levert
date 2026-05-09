import { afterEach, describe, expect, test, vi } from "vitest";

import Benchmark from "../../../src/util/misc/Benchmark.js";

describe("Benchmark", () => {
    afterEach(() => {
        Benchmark.clear();
        Benchmark.maxTimepointAge = 5 * 60 * 1000;
        Benchmark._timepointSweepInterval = 30 * 1000;
        vi.restoreAllMocks();
    });

    test("supports symbol time keys", () => {
        const perfSpy = vi.spyOn(performance, "now");
        perfSpy.mockReturnValueOnce(10).mockReturnValueOnce(12.8);

        const key = Symbol("symbol_time_key");
        Benchmark.startTiming(key);

        expect(Benchmark.stopTiming(key, false)).toBe(2);
    });

    test("formats missing symbol keys without throwing", () => {
        const key = Symbol("missing");
        expect(Benchmark.getTime(key)).toBe('Key "missing" not found.');
    });

    test("supports string time keys", () => {
        const perfSpy = vi.spyOn(performance, "now");
        perfSpy.mockReturnValueOnce(100).mockReturnValueOnce(109.9);

        Benchmark.startTiming("__t1__1");

        expect(Benchmark.stopTiming("__t1__1")).toBe(9);
        expect(Benchmark.getTime("__t1__1", false)).toBe(9);
    });

    test("supports symbol count names and displays symbol descriptions", () => {
        const name = Symbol("decode");

        expect(Benchmark.getCount(name)).toBe('Count "decode" not found.');
        Benchmark.defineCount(name);
        expect(Benchmark.getCount(name)).toBe("decode_0");
    });

    test("sweeps stale timepoints over max age", () => {
        Benchmark.maxTimepointAge = 5;

        const staleKey = Symbol("stale"),
            freshKey = Symbol("fresh");

        Benchmark.timepoints.set(staleKey, 10);
        Benchmark.timepoints.set(freshKey, 96);

        const perfSpy = vi.spyOn(performance, "now");
        perfSpy.mockReturnValue(100);

        Benchmark._sweepTimepoints();

        expect(Benchmark.timepoints.has(staleKey)).toBe(false);
        expect(Benchmark.timepoints.has(freshKey)).toBe(true);
    });

    test("measures runs and logs the benchmark summary", () => {
        const perfSpy = vi.spyOn(performance, "now");
        perfSpy.mockReturnValueOnce(0).mockReturnValueOnce(1).mockReturnValueOnce(2).mockReturnValueOnce(4);

        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const [min, max, avg, sum, result] = Benchmark.runFunction("bench", 2, value => value + 1, 4);

        expect([min, max, avg, sum, result]).toEqual([1, 2, 1.5, 3, 5]);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("bench - 2 runs"));
    });
});
