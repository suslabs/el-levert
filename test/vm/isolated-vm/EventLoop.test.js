import nodeVM from "node:vm";

import { describe, expect, test, vi } from "vitest";

import "../../../setupGlobals.js";
import getEventLoopCode from "../../../src/util/vm/getEventLoopCode.js";

describe("EventLoop", () => {
    test("generates valid timer install code with Codegen", () => {
        const cleared = [],
            intervals = [],
            timeouts = [];

        const sandbox = {
            __timers_clear(id) {
                cleared.push(id);
            },

            __timers_registerInterval(delay) {
                intervals.push(delay);
                return 2;
            },

            __timers_registerTimeout(delay) {
                timeouts.push(delay);
                return 1;
            }
        };

        const code = getEventLoopCode();

        expect(code).not.toMatch(/\/\/|\/\*/);
        expect(() => new Function(code)).not.toThrow();

        nodeVM.runInNewContext(code, sandbox);

        const timeoutCallback = vi.fn(),
            intervalCallback = vi.fn();

        expect(sandbox.setTimeout(timeoutCallback, 5, "a", "b")).toBe(1);
        expect(sandbox.setInterval(intervalCallback, 7, "c")).toBe(2);
        expect(timeouts).toEqual([5]);
        expect(intervals).toEqual([7]);

        sandbox.__timers_execute(1);
        sandbox.__timers_execute(2);

        expect(timeoutCallback).toHaveBeenCalledWith("a", "b");
        expect(intervalCallback).toHaveBeenCalledWith("c");

        sandbox.clearTimeout(1);
        sandbox.clearInterval(2);

        expect(cleared).toEqual([1, 2]);
    });
});
