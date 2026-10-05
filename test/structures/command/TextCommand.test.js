import { describe, expect, test } from "vitest";

import TextCommand from "../../../src/structures/command/TextCommand.js";
import TextCommandContext from "../../../src/structures/command/context/TextCommandContext.js";

class ParentTextCommand extends TextCommand {
    async handler(context) {
        return `parent:${context.argsText}`;
    }
}

class ChildTextCommand extends TextCommand {
    async handler(context) {
        return `sub:${context.argsText}`;
    }
}

describe("TextCommand", () => {
    test("requires subcommands to define a parent", () => {
        expect(() => new ChildTextCommand({ name: "child", parent: "", subcommand: true })).toThrow(
            "Subcommands must have a parent command"
        );
    });

    test("supports help text, subcommands, aliases, and execution routing", async () => {
        const parent = new ParentTextCommand({
            name: "tag",
            description: "Command description",
            usage: "tag <subcommand>",
            prefix: "!"
        });
        const subcommand = new ChildTextCommand({
            name: "add",
            aliases: ["a"],
            parent: "tag",
            subcommand: true
        });

        parent.addSubcommand(subcommand);

        expect(parent.getSubcmd("add")).toBe(subcommand);
        expect(parent.getSubcmd("a")).toBe(subcommand);
        expect(parent.getSubcmdList().split("|")).toEqual(["a", "add"]);
        expect(parent.getHelpText()).toContain("Description:");
        expect(parent.getArgsHelp("name value", true)).toContain("!**tag** `name value`");

        await expect(parent.execute(new TextCommandContext({ argsText: "-help" }))).resolves.toContain("Usage:");
        await expect(parent.execute(new TextCommandContext({ argsText: "add body" }))).resolves.toBe("sub:body");

        parent.removeSubcommand(subcommand);

        expect(parent.getSubcmd("a")).toBeNull();
        await expect(parent.execute(new TextCommandContext({ argsText: "body" }))).resolves.toBe("parent:body");
    });

    test("formats help embed with 2 fields and default messages in discord mode", () => {
        const cmd = new ParentTextCommand({
            name: "sample",
            description: "Sample description",
            usage: "sample <arg>",
            prefix: "!"
        });
        const help = cmd.getHelpText(true);

        expect(help.embeds).toHaveLength(1);
        expect(help.embeds[0].data.fields).toEqual([
            { name: "Description", value: "Sample description" },
            { name: "Usage", value: "sample <arg>" }
        ]);

        const emptyCmd = new ParentTextCommand({ name: "empty" });
        const emptyHelp = emptyCmd.getHelpText(true);

        expect(emptyHelp.embeds).toHaveLength(1);
        expect(emptyHelp.embeds[0].data.fields).toEqual([
            { name: "Description", value: "No description provided." },
            { name: "Usage", value: "No usage provided." }
        ]);
    });
});
