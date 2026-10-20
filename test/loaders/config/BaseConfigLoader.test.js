import { describe, expect, test } from "vitest";

import "../../../setupGlobals.js";

import BaseConfigLoader from "../../../src/loaders/config/BaseConfigLoader.js";

describe("BaseConfigLoader", () => {
    test("uses objects returned by modify hooks as loaded data", () => {
        const loader = Object.create(BaseConfigLoader.prototype);
        loader.data = { original: true };
        loader._childModify = () => ({ modified: true });

        loader._modify();

        expect(loader.data).toEqual({ modified: true });
    });

    test("applyDefaults applies descriptor constraints, arithmetic, and clamping", () => {
        const schema = {
            timeout: {
                base: 1,
                min: 0,
                max: 5000,
                round: true,
                mult: 1000
            },
            limit: {
                min: 0,
                max: 100
            },
            nested: {
                scaled: {
                    base: 5,
                    mult: 2,
                    round: true
                }
            }
        };

        const data = {
            timeout: 2.4,
            limit: 200,
            nested: {
                scaled: 10.4
            }
        };

        BaseConfigLoader.applyDefaults(data, schema);

        expect(data.timeout).toBe(2400);
        expect(data.limit).toBe(100);
        expect(data.nested.scaled).toBe(21);
    });

    test("applyDefaults clamps between -1 and real values and scales negative numbers properly", () => {
        const schema = {
            limit: {
                min: -1,
                max: 5000
            },
            offset: {
                min: -1000,
                mult: 10
            },
            count: {
                min: -1,
                round: true
            },
            clampedUnder: {
                min: -1,
                max: 100
            },
            clampedOver: {
                min: -1,
                max: 100
            }
        };

        const data = {
            limit: -1,
            offset: -1,
            count: -1,
            clampedUnder: -50,
            clampedOver: 200
        };

        BaseConfigLoader.applyDefaults(data, schema);

        expect(data.limit).toBe(-1);
        expect(data.offset).toBe(-10);
        expect(data.count).toBe(-1);
        expect(data.clampedUnder).toBe(-1);
        expect(data.clampedOver).toBe(100);
    });

    test("applyDefaults uses base value when property is missing or nullish", () => {
        const schema = {
            timeout: {
                base: 2,
                mult: 1000,
                round: true
            },
            nested: {
                count: {
                    base: 10
                }
            }
        };

        const data = {
            nested: {}
        };

        BaseConfigLoader.applyDefaults(data, schema);

        expect(data.timeout).toBe(2000);
        expect(data.nested.count).toBe(10);
    });

    test("applyDefaults clones default objects and arrays without mutating original defaults", () => {
        const defaults = Object.freeze({
            parens: {},
            funnyWords: ["lol", "kek"],
            flags: { active: true }
        });

        const data = {};

        BaseConfigLoader.applyDefaults(data, defaults);

        expect(data.parens).toEqual({});
        expect(data.funnyWords).toEqual(["lol", "kek"]);

        data.funnyWords.push("rofl");
        data.parens.foo = "bar";

        expect(defaults.funnyWords).toEqual(["lol", "kek"]);
        expect(defaults.parens).toEqual({});
    });

    test("_modify applies static defaults when defined on constructor", () => {
        class CustomLoader extends BaseConfigLoader {
            static defaults = Object.freeze({
                retries: {
                    base: 3,
                    min: 1
                },
                tags: []
            });
        }

        const loader = Object.create(CustomLoader.prototype);
        loader.data = {};

        loader._modify();

        expect(loader.data.retries).toBe(3);
        expect(loader.data.tags).toEqual([]);
    });

    test("_modify does nothing if static defaults is absent", () => {
        class NoDefaultsLoader extends BaseConfigLoader {}

        const loader = Object.create(NoDefaultsLoader.prototype);
        loader.data = { original: 123 };

        loader._modify();

        expect(loader.data).toEqual({ original: 123 });
    });
});
