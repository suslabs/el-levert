import { describe, expect, test, vi } from "vitest";

import Util from "../../../src/util/Util.js";
import IntervalLoop from "../../../src/util/misc/IntervalLoop.js";
import UtilError from "../../../src/errors/UtilError.js";

describe("IntervalLoop", () => {
    test("runs and stops synchronous callbacks synchronously", () => {
        vi.useFakeTimers();

        try {
            const callback = vi.fn();
            const interval = Util.durationSeconds.milli / Util.durationSeconds.milli;
            const loop = new IntervalLoop(callback, interval);

            loop.start();
            vi.advanceTimersByTime(3 * interval);
            expect(callback).toHaveBeenCalledTimes(3);
            expect(loop.stop()).toBeUndefined();
            expect(loop.running).toBe(false);

            vi.advanceTimersByTime(3 * interval);
            expect(callback).toHaveBeenCalledTimes(3);
        } finally {
            vi.useRealTimers();
        }
    });

    test("does not schedule duplicate timers when restarted inside a synchronous callback", () => {
        vi.useFakeTimers();

        try {
            const interval = Util.durationSeconds.milli / Util.durationSeconds.milli;
            let calls = 0;

            const loop = new IntervalLoop(() => {
                calls++;

                if (calls === 1) {
                    loop.stop();
                    loop.start();
                }
            }, interval);

            loop.start();
            vi.advanceTimersByTime(3 * interval);
            loop.stop();

            expect(calls).toBe(3);
        } finally {
            vi.useRealTimers();
        }
    });

    test("waits for a pending callback when restarted from that callback", async () => {
        vi.useFakeTimers();

        try {
            const interval = Util.durationSeconds.milli / Util.durationSeconds.milli;
            let release;
            const pending = new Promise(resolve => {
                release = resolve;
            });

            let calls = 0;
            const loop = new IntervalLoop(() => {
                calls++;

                if (calls === 1) {
                    loop.stop();
                    loop.start();
                    return pending;
                }
            }, interval);

            loop.start();
            vi.advanceTimersByTime(5 * interval);
            expect(calls).toBe(1);

            release();
            await vi.advanceTimersByTimeAsync(interval);
            expect(calls).toBe(2);
            loop.stop();
        } finally {
            vi.useRealTimers();
        }
    });

    test("waits for the current callback on stop and never overlaps callbacks", async () => {
        const interval = Util.durationSeconds.milli / Util.durationSeconds.milli;

        let release;
        const pending = new Promise(resolve => {
            release = resolve;
        });

        let notifyStart;
        const started = new Promise(resolve => {
            notifyStart = resolve;
        });

        const callback = vi.fn(async () => {
            notifyStart();
            await pending;
        });
        const onError = vi.fn();
        const loop = new IntervalLoop(callback, interval, onError);

        loop.start();
        loop.start();
        await started;
        await Util.delay(5 * interval);
        expect(callback).toHaveBeenCalledTimes(1);

        const stopping = loop.stop();
        expect(loop.running).toBe(false);
        release();
        await stopping;

        expect(loop.running).toBe(false);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(onError).not.toHaveBeenCalled();
    });

    test("reports a callback failure and continues with the next run", async () => {
        const interval = Util.durationSeconds.milli / Util.durationSeconds.milli;
        const failure = new UtilError("callback failed");
        let complete;
        const completed = new Promise(resolve => {
            complete = resolve;
        });

        let calls = 0;
        const callback = () => {
            calls++;
            if (calls === 1) {
                throw failure;
            }

            complete();
        };

        const onError = vi.fn();
        const loop = new IntervalLoop(callback, interval, onError);
        loop.start();
        await completed;
        await loop.stop();

        expect(calls).toBe(2);
        expect(onError).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenCalledWith(failure);
    });
});
