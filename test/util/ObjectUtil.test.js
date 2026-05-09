import { describe, expect, test } from "vitest";

import ObjectUtil from "../../src/util/ObjectUtil.js";
import AssignPropertyTypes from "../../src/util/AssignPropertyTypes.js";

describe("ObjectUtil", () => {
    test("filters, clones, assigns, and defines properties", () => {
        expect(ObjectUtil.filterObject({ a: 1, b: 2 }, key => key === "a")).toEqual({ a: 1 });
        expect(
            ObjectUtil.rewriteObject(
                { a: 1 },
                key => key.toUpperCase(),
                value => value + 1
            )
        ).toEqual({ A: 2 });
        expect(ObjectUtil.removeUndefinedValues({ a: 1, b: undefined })).toEqual({ a: 1 });
        expect(ObjectUtil.reverseObject({ a: "x", b: "y" })).toEqual({ x: "a", y: "b" });

        const target = {};
        ObjectUtil.setValuesWithDefaults(target, { a: 1 }, { a: 3, b: () => 5, c: [1] });
        expect(target.a).toBe(1);
        expect(typeof target.b).toBe("function");
        expect(target.b()).toBe(5);
        expect(target.c).toEqual([1]);

        const source = {};
        Object.defineProperty(source, "hidden", {
            value: 2,
            enumerable: false
        });
        source.visible = 1;

        const assigned = ObjectUtil.assign({}, source, [AssignPropertyTypes.both]);
        expect(assigned.visible).toBe(1);
        expect(Object.getOwnPropertyDescriptor(assigned, "hidden").enumerable).toBe(false);

        const keysOnly = ObjectUtil.assign({}, source, AssignPropertyTypes.keys);
        expect(keysOnly.visible).toBe(1);
        expect("hidden" in keysOnly).toBe(false);

        const clone = ObjectUtil.shallowClone(source, AssignPropertyTypes.both);
        expect(Object.getOwnPropertyDescriptor(clone, "hidden").value).toBe(2);

        const obj = {};
        ObjectUtil.defineProperty(
            obj,
            value => [
                {
                    propName: "answer",
                    desc: { value }
                },
                {
                    propName: "computed",
                    desc: { get: () => value + 1 }
                }
            ],
            41
        );
        expect(obj.answer).toBe(41);
        expect(obj.computed).toBe(42);

        expect(() =>
            ObjectUtil.defineProperty({}, () => ({
                propName: "",
                desc: null
            }))
        ).toThrow("Invalid property recieved from factory");

        expect(() => ObjectUtil.assign({}, {}, [])).toThrow("Invalid property options");
    });

    test("wipes object entries synchronously and asynchronously", async () => {
        const sync = { a: 1, b: 2 };
        expect(ObjectUtil.wipeObject(sync, key => key === "a")).toBe(1);
        expect(sync).toEqual({ b: 2 });

        const asyncObj = { a: 1, b: 2 };
        await expect(ObjectUtil.wipeObject(asyncObj, async key => key === "b")).resolves.toBe(1);
        expect(asyncObj).toEqual({ a: 1 });

        const all = { a: 1, b: 2 };
        expect(ObjectUtil.wipeObject(all)).toBe(2);
        expect(all).toEqual({});
    });
});
