import { describe, expect, test, afterEach, vi } from "vitest";
import "../../../setupGlobals.js";
import CallstackUtil from "../../../src/util/misc/CallstackUtil.js";

describe("CallstackUtil", () => {
    test("captures callstack info and reports no info for mismatched project roots", () => {
        expect(CallstackUtil.getCallstack().length).toBeGreaterThan(0);

        const info = CallstackUtil.getCallInfo();
        expect(typeof info).toBe("string");
        expect(info).not.toBe("no info");
        expect(CallstackUtil.getCallInfo({ depth: 9999 })).toBe("no info");

        const oldRoot = globalThis.projRootUrl;
        globalThis.projRootUrl = "file:///missing-root";
        expect(CallstackUtil.getCallInfo()).toBe("no info");
        globalThis.projRootUrl = oldRoot;
    });
});

describe("Merged Branch Coverage", () => {
    afterEach(() => {
        vi.doUnmock("../../../src/util/TypeTester.js");
        vi.resetModules();
        vi.restoreAllMocks();
    });

    describe("CallstackUtil branch coverage", () => {
        test("surfaces invalid stack values and rethrows unexpected errors", async () => {
            vi.doMock("../../../src/util/TypeTester.js", () => ({
                default: {
                    isObject: () => false
                }
            }));

            let CallstackUtil = (await import("../../../src/util/misc/CallstackUtil.js?branch_invalid")).default;
            expect(CallstackUtil.getCallInfo()).toBe("no info");

            vi.doUnmock("../../../src/util/TypeTester.js");
            vi.resetModules();
            vi.doMock("../../../src/util/TypeTester.js", () => ({
                default: {
                    isObject: () => {
                        throw new Error("boom");
                    }
                }
            }));

            CallstackUtil = (await import("../../../src/util/misc/CallstackUtil.js?branch_throw")).default;
            expect(() => CallstackUtil.getCallInfo()).toThrow("boom");
        });

        test("returns no info when stack inspection is filtered out", async () => {
            const CallstackUtil = (await import("../../../src/util/misc/CallstackUtil.js")).default;
            const oldRoot = globalThis.projRootUrl;

            globalThis.projRootUrl = "file:///missing-root";
            expect(CallstackUtil.getCallInfo()).toBe("no info");
            globalThis.projRootUrl = oldRoot;
        });
    });
});
