import { describe, expect, test } from "vitest";

import Codegen from "../../../src/util/vm/Codegen.js";

describe("Codegen", () => {
    test("formats common javascript fragments", () => {
        Codegen.indentation = 2;

        expect(Codegen.indent("a\nb")).toBe("  a\n  b");
        expect(Codegen.indent("")).toBe("  ");
        expect(Codegen.isIdentifier("alpha_beta")).toBe(true);
        expect(Codegen.identifier("not valid")).toBe('"not valid"');
        expect(Codegen.statement("value")).toBe("value;");
        expect(Codegen.declaration("x", "1")).toBe("let x = 1;");
        expect(Codegen.assignment("x", "2")).toBe("x = 2;");
        expect(Codegen.string('say "hi"')).toBe("'say \"hi\"'");
        expect(Codegen.array(["a", "b"])).toBe("[a, b]");
        expect(Codegen.array("a")).toBe("[a]");
        expect(Codegen.object({ alpha: 1 })).toContain("alpha:");
        expect(Codegen.equals("a", "b", false)).toBe("a !== b");
        expect(Codegen.isUndefined("a")).toContain('typeof a === "undefined"');
        expect(Codegen.access(["root", "child"])).toBe("root.child");
        expect(Codegen.access(["root", { name: "key", dynamic: true }])).toBe("root[key]");
        expect(Codegen.access(["root", "not valid"])).toBe('root["not valid"]');
        expect(Codegen.block("value")).toBe("{\n  value;\n}");
        expect(Codegen.return(["a", "b"])).toBe("return [a, b];");
        expect(Codegen.throw("Error", Codegen.string("boom"))).toBe('throw new Error("boom");');
        expect(Codegen.function("sum", ["a", "b"], "return a + b")).toContain("function sum(a, b)");
        expect(Codegen.function("sum", ["a"], "return a", 5)).toContain("function sum(a)");
        expect(Codegen.if("a", "b", "c")).toContain("else");
        expect(Codegen.call("sum", ["1", "2"])).toBe("sum(1, 2);");
        expect(Codegen.instantiate("Thing", ["1"])).toBe("new Thing(1);");
        expect(Codegen.closure("return 1")).toContain("(function()");
        expect(Codegen.tryCatch("run()", "handle(err)")).toContain("catch (err)");
        expect(Codegen.class("Thing", "Base", "body")).toContain("class Thing extends Base");
        expect(Codegen.getObject("{ alpha: 1 }")).toEqual({ alpha: 1 });
    });
});
