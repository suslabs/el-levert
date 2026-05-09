import { describe, expect, test, vi } from "vitest";

import VMError from "../../../src/errors/VMError.js";
import { ExecutionTypes, FuncTypes } from "../../../src/structures/vm/FuncTypes.js";
import VMFunction from "../../../src/structures/vm/VMFunction.js";

describe("VMFunction", () => {
    test("validates constructor options and resolves bot references", async () => {
        expect(() => new VMFunction({}, new Map())).toThrow("must have a name");
        expect(() => new VMFunction({ name: "run" }, new Map())).toThrow("must have a reference");
        expect(() => new VMFunction({ name: "run", ref: () => {}, type: "bad" }, new Map())).toThrow(
            "Invalid function type"
        );

        const service = {
            name: "svc",
            run(context, value) {
                return `${this.name}:${context.id}:${value}`;
            }
        };
        const propertyMap = new Map([["service", service]]);
        const evalClosure = vi.fn();

        const vmFunction = new VMFunction(
            {
                name: "run",
                ref: "path:service.run"
            },
            propertyMap
        );

        expect(vmFunction.ref("ctx", "value")).toBe("svc:undefined:value");

        await vmFunction.register(
            {
                id: "ctx",
                context: {
                    evalClosure
                }
            },
            propertyMap
        );

        expect(evalClosure).toHaveBeenCalledWith(
            expect.any(String),
            [expect.any(Function)],
            VMFunction.registerOptions
        );
        await expect(
            vmFunction.register(
                {
                    context: {
                        evalClosure
                    }
                },
                propertyMap
            )
        ).rejects.toThrow("already been registered");
    });

    test("resolves bound references and script helpers", () => {
        const refs = {
            service: {
                run(prefix, suffix) {
                    return `${prefix}:${suffix}`;
                }
            },
            helper(value, suffix) {
                return `${value}-${suffix}`;
            },
            value: "bound"
        };
        const propertyMap = new Map(Object.entries(refs));

        const bound = VMFunction._resolveBinds(refs.helper, ["path:value"], propertyMap);
        expect(bound("tail")).toBe("bound-tail");

        const script = new VMFunction(
            {
                name: "scriptFn",
                ref: function scriptFn() {
                    return true;
                },
                execution: ExecutionTypes.script,
                singleContext: false,
                otherRefs: [
                    {
                        ref: "path:helper",
                        binds: ["path:value"]
                    }
                ]
            },
            propertyMap
        );

        expect(script._getRegisterCode()).toContain("scriptFn");
        expect(script._getOtherRefs(propertyMap)).toHaveLength(1);
        expect(script._getOtherRefs(propertyMap)[0]("tail")).toBe("bound-tail");
        expect(script.getData("vm_")).toEqual(expect.objectContaining({ vm_name: "scriptFn", vm_execution: "script" }));
        expect(() => VMFunction._resolveReference("bad", propertyMap)).toThrow(VMError);
        expect(() => VMFunction._resolveBinds(null, [], propertyMap)).toThrow("unresolved ref");
        expect(Object.values(FuncTypes)).toContain("applySync");
    });
});
