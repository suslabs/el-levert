import { describe, expect, test, vi } from "vitest";

import "../../setupGlobals.js";

import VM from "../../src/vm/VM.js";

describe("VM", () => {
    test("requires a name and a runScript implementation", () => {
        expect(
            () =>
                new (class extends VM {
                    constructor() {
                        super(true);
                    }

                    static $name = "";

                    runScript() {}
                })()
        ).toThrow("VM must have a name");

        expect(
            () =>
                new (class extends VM {
                    static $name = "brokenVM";

                    constructor() {
                        super(true);
                    }
                })()
        ).toThrow("Child class must have a runScript function");
    });

    test("guards load, unload, and script execution when disabled", () => {
        const load = vi.fn();
        const unload = vi.fn();

        class TestVM extends VM {
            static $name = "testVM";

            constructor(enabled) {
                super(enabled);
            }

            load() {
                return load();
            }

            unload() {
                return unload();
            }

            runScript(code, extra) {
                return `${code}:${extra}`;
            }

            getDisabledMessage() {
                return "custom disabled";
            }
        }

        const disabled = new TestVM(false);

        expect(disabled.load()).toBeUndefined();
        expect(disabled.unload()).toBeUndefined();
        expect(load).not.toHaveBeenCalled();
        expect(unload).not.toHaveBeenCalled();
        expect(() => disabled.runScript("alpha", "beta")).toThrow("custom disabled");

        const enabled = new TestVM(true);
        expect(enabled.runScript("alpha", "beta")).toBe("alpha:beta");
    });
});
