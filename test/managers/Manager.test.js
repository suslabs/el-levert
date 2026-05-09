import { describe, expect, test } from "vitest";

import Manager from "../../src/managers/Manager.js";

class ExampleManager extends Manager {
    static $name = "exampleManager";

    load() {
        return "loaded";
    }

    unload() {
        return "unloaded";
    }
}

describe("Manager", () => {
    test("validates manager names and wraps lifecycle methods", () => {
        expect(
            () =>
                new (class extends Manager {
                    load() {
                        return true;
                    }
                })()
        ).toThrow("must have a name");

        const manager = new ExampleManager(true);
        expect(manager.load()).toBe("loaded");
        expect(manager.unload()).toBe("unloaded");
        expect(new ExampleManager(false).load()).toBeUndefined();
    });
});
