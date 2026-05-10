import { describe, expect, test } from "vitest";

import BaseCommand from "../../../src/structures/command/BaseCommand.js";
import BaseCommandContext from "../../../src/structures/command/context/BaseCommandContext.js";

class TestBaseCommand extends BaseCommand {
    async handler(context) {
        return [context.argsText, context.flag];
    }
}

describe("BaseCommand", () => {
    test("validates required command fields", () => {
        expect(() => new TestBaseCommand({})).toThrow("Command must have a name");
        expect(
            () =>
                new (class extends BaseCommand {} )({
                    name: "ping"
                })
        ).toThrow("Command must have a handler function");
        expect(() => new TestBaseCommand({ name: "sub", subcommand: true })).toThrow("Subcommands must have a parent command");
    });

    test("manages subcommands, names, equality, and data projection", async () => {
        const parent = new TestBaseCommand({
            name: "tag"
        });
        const sub = new TestBaseCommand({
            name: "add",
            parent: "tag",
            subcommand: true
        });

        expect(parent.getData("$", true, ["name"])).toEqual({ $name: "tag" });
        expect(parent.matches("tag")).toBe(true);
        expect(parent.getName()).toBe("tag");
        expect(sub.getName(true)).toContain('parent command "tag"');

        parent.addSubcommand(sub);
        expect(parent.getSubcmd("add")).toBe(sub);
        expect(parent.getSubcmdNames()).toEqual(["add"]);
        expect(parent.getSubcmds()).toEqual([sub]);
        expect(parent.matchesSubcmd("add")).toBe(true);

        expect(
            await parent.execute(
                new BaseCommandContext({
                    argsText: "x",
                    flag: 2
                })
            )
        ).toEqual(["x", 2]);

        const emptyContext = new BaseCommandContext("bad-context-data");
        expect(emptyContext.commandName).toBe("");
        expect(emptyContext.clone("bad-overrides")).toBeInstanceOf(BaseCommandContext);
        expect(emptyContext.withArgs("next", "bad-overrides").argsText).toBe("next");

        const createdContext = parent.createContext("bad-context-data");
        expect(createdContext).toBeInstanceOf(BaseCommandContext);
        expect(createdContext.command).toBe(parent);
        expect(createdContext.argsText).toBe("");

        expect(sub.subcmdOf(parent, "add")).toBe(true);
        expect(sub.equals(new TestBaseCommand({ name: "add", parent: "tag", subcommand: true }))).toBe(true);
        expect(sub.equivalent(new TestBaseCommand({ name: "add", parent: "tag", subcommand: true }))).toBe(true);

        parent.removeSubcommand(sub);
        expect(parent.getSubcmd("add")).toBeNull();

        parent.addSubcommand(sub);
        parent.removeSubcommands();
        expect(parent.getSubcmds()).toEqual([]);

        expect(() => sub.addSubcommand(sub)).toThrow("Only parent commands can have subcommands");
        expect(() => parent.bind(parent)).toThrow("Can only bind subcommands");
    });
});
