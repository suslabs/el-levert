import { EventEmitter } from "node:events";

import { afterEach, describe, expect, test, vi } from "vitest";

import Util from "../../../../src/util/Util.js";
import Benchmark from "../../../../src/util/misc/Benchmark.js";

function createDeferred() {
    let resolve, reject;

    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return {
        promise,
        reject,
        resolve
    };
}

describe("Benchmark", () => {
    afterEach(() => {
        Benchmark.clear();
        Benchmark.maxTimepointAge = 5 * 60 * 1000;
        Benchmark._timepointSweepInterval = 30 * 1000;

        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test("supports string time keys", () => {
        const perfSpy = vi.spyOn(performance, "now");
        perfSpy.mockReturnValueOnce(100).mockReturnValueOnce(109.9);

        Benchmark.startTiming("__t1__1");

        expect(Benchmark.stopTiming("__t1__1")).toBe(9);
        expect(Benchmark.getTime("__t1__1", false)).toBe(9);
    });

    test("supports string count names", () => {
        const name = "decode";

        expect(Benchmark.getCount(name)).toBe('Count "decode" not found.');

        Benchmark.defineCount(name);

        expect(Benchmark.getCount(name)).toBe("decode_0");
    });

    test("keeps timing across yielded async paths with the same key", async () => {
        const perfSpy = vi.spyOn(performance, "now");
        perfSpy.mockReturnValueOnce(10).mockReturnValueOnce(22.8);

        const run = async () => {
            Benchmark.startTiming("yielded_path");

            await Promise.resolve();

            return Benchmark.stopTiming("yielded_path", false);
        };

        await expect(run()).resolves.toBe(12);
    });

    test("isolates intersecting event paths using the same key", async () => {
        const perfSpy = vi.spyOn(performance, "now");
        perfSpy.mockReturnValueOnce(10).mockReturnValueOnce(20).mockReturnValueOnce(35).mockReturnValueOnce(60);

        const emitter = new EventEmitter(),
            waits = {
                a: createDeferred(),
                b: createDeferred()
            },
            out = [],
            runs = [];

        emitter.on("run", label => {
            runs.push(
                (async () => {
                    Benchmark.startTiming("event_path");

                    await waits[label].promise;

                    out.push([label, Benchmark.stopTiming("event_path", false)]);
                })()
            );
        });

        emitter.emit("run", "a");
        emitter.emit("run", "b");

        waits.b.resolve();
        await runs[1];

        waits.a.resolve();
        await Promise.all(runs);

        expect(out).toEqual([
            ["b", 15],
            ["a", 50]
        ]);
    });

    test("isolates timeout and library async paths using the same key", async () => {
        vi.useFakeTimers();

        const perfSpy = vi.spyOn(performance, "now");
        perfSpy.mockReturnValueOnce(10).mockReturnValueOnce(20).mockReturnValueOnce(35).mockReturnValueOnce(70);

        const runTimeout = async () => {
                Benchmark.startTiming("shared_async");

                await Util.delay(5);

                return Benchmark.stopTiming("shared_async", false);
            },
            runLibrary = async () => {
                Benchmark.startTiming("shared_async");

                await Util.runWithTimeout(() => Promise.resolve("ok"), new Error("timeout"), 50);

                return Benchmark.stopTiming("shared_async", false);
            };

        const timeoutRun = runTimeout(),
            libraryRun = runLibrary();

        const libraryTime = await libraryRun;

        await vi.advanceTimersByTimeAsync(5);

        const timeoutTime = await timeoutRun;

        expect(libraryTime).toBe(15);
        expect(timeoutTime).toBe(60);
        expect(Benchmark.timepoints.has("shared_async")).toBe(false);
    });

    test("wrapFunction times async library calls through the full path", async () => {
        vi.useFakeTimers();

        const perfSpy = vi.spyOn(performance, "now");
        perfSpy.mockReturnValueOnce(10).mockReturnValueOnce(25);

        const wrapped = Benchmark.wrapFunction("decode", async value => {
            await Util.runWithTimeout(() => Util.delay(5), new Error("timeout"), 50);
            return value + 1;
        });

        const run = wrapped(4);

        await vi.advanceTimersByTimeAsync(5);

        await expect(run).resolves.toBe(5);
        expect(Benchmark.getTime("decode_1", false)).toBe(15);
    });

    test("sweeps stale timepoints over max age", () => {
        Benchmark.maxTimepointAge = 5;

        const perfSpy = vi.spyOn(performance, "now");
        perfSpy.mockReturnValueOnce(0).mockReturnValue(100);

        Benchmark.startTiming("stale");
        Benchmark.timepoints.set("stale", 10);
        Benchmark.timepoints.set("fresh", 96);

        Benchmark._sweepTimepoints();

        expect(Benchmark.timepoints.has("stale")).toBe(false);
        expect(Benchmark.timepoints.has("fresh")).toBe(true);
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
