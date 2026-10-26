import { describe, expect, test } from "vitest";

import CommandParseSession from "../../../../src/parsers/command/structs/CommandParseSession.js";
import CommandArgumentResult from "../../../../src/parsers/command/structs/CommandArgumentResult.js";
import CommandValidationIssue from "../../../../src/parsers/command/structs/CommandValidationIssue.js";

describe("CommandParseSession", () => {
    test("valid reflects presence of issues and invalid results", () => {
        const session = new CommandParseSession({});

        expect(session.valid).toBe(true);

        session.addResult(new CommandArgumentResult("arg1", "val", "val", true));
        expect(session.valid).toBe(true);

        session.addResult(new CommandArgumentResult("arg2", "bad", null, false));
        expect(session.valid).toBe(false);

        const session2 = new CommandParseSession({});
        session2.addIssue(new CommandValidationIssue("unclosed_quote", "Unclosed quote"));
        expect(session2.valid).toBe(false);
    });

    test("resolves source values from args, results, and context", () => {
        const session = new CommandParseSession({
            argsText: "hello world",
            customProp: 42
        });

        expect(session.getSourceValue("args")).toBe("hello world");
        expect(session.getSourceValue("customProp")).toBe(42);

        session.addResult(new CommandArgumentResult("prevArg", "raw", "parsedValue", true));
        expect(session.getSourceValue("prevArg")).toBe("parsedValue");
    });

    test("caches pattern regex matches per source and pattern", () => {
        const session = new CommandParseSession({
            argsText: "123-abc"
        });

        const pattern = /^(\d+)-([a-z]+)$/;

        let execCalls = 0;
        const origExec = pattern.exec.bind(pattern);
        pattern.exec = text => {
            execCalls++;
            return origExec(text);
        };

        const match1 = session.getPatternMatch(pattern, "args");
        const match2 = session.getPatternMatch(pattern, "args");

        expect(match1).toEqual(match2);
        expect(execCalls).toBe(1);
    });

    test("removes argument ranges from remainingText in reverse order", () => {
        const session = new CommandParseSession({
            argsText: "zero one two three"
        });

        // "one " is index 5..9, "three" is index 13..18
        session.removeArgsRanges([
            [5, 9],
            [13, 18]
        ]);

        expect(session.remainingText).toBe("zero two ");
    });

    test("attaches named issues to corresponding argument results", () => {
        const session = new CommandParseSession({});

        session.addResult(new CommandArgumentResult("opt", "val", "val", true));
        session.addIssue(new CommandValidationIssue("duplicate_option", "Duplicate", { name: "opt" }));

        session.applyNamedIssues();

        const result = session.results.get("opt");
        expect(result.valid).toBe(false);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].code).toBe("duplicate_option");
    });
});
