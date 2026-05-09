import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let tempDir;
let BaseCommandManager;
let TextCommand;
let TestManager;
let manager;

async function writeCommand(relPath, source) {
    const filePath = path.join(tempDir, relPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, source);
}

beforeEach(async () => {
    manager = null;

    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false,
        config: {
            wrapEvents: false
        }
    });

    tempDir = path.join(runtime.tempDir, "commands");
    await fs.mkdir(tempDir, { recursive: true });

    ({ default: BaseCommandManager } = await import("../../../src/managers/command/BaseCommandManager.js"));
    ({ default: TextCommand } = await import("../../../src/structures/command/TextCommand.js"));

    TestManager = class TestManager extends BaseCommandManager {
        static $name = "testCommandManager";
        static commandClass = TextCommand;
    };
});

afterEach(async () => {
    manager?.unload?.();
    manager = null;
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("BaseCommandManager", () => {
    test("loads real command files, binds subcommands, drops duplicates/orphans, and deletes trees", async () => {
        await writeCommand(
            "tag.js",
            'class TagCommand { static info = { name: "tag", prefix: "!", description: "tag", subcommands: ["add"] }; async handler() { return "tag"; } }\n\nexport default TagCommand;'
        );
        await writeCommand(
            "add.js",
            'class AddCommand { static info = { name: "add", prefix: "!", parent: "tag", subcommand: true }; async handler() { return "add"; } }\n\nexport default AddCommand;'
        );
        await writeCommand(
            "orphan.js",
            'class OrphanCommand { static info = { name: "orphan", prefix: "!", parent: "ghost", subcommand: true }; async handler() { return "orphan"; } }\n\nexport default OrphanCommand;'
        );
        await writeCommand(
            "dupe-a.js",
            'class AlphaACommand { static info = { name: "alpha", prefix: "!", description: "A" }; async handler() { return "a"; } }\n\nexport default AlphaACommand;'
        );
        await writeCommand(
            "dupe-b.js",
            'class AlphaBCommand { static info = { name: "alpha", prefix: "!", description: "B" }; async handler() { return "b"; } }\n\nexport default AlphaBCommand;'
        );

        manager = new TestManager(true, tempDir);
        const loadRes = await manager.load();

        expect(loadRes).toBeTruthy();
        expect(manager.commands.map(command => command.name).sort()).toEqual(["add", "alpha", "tag"]);
        expect(manager.searchCommands("tag").getSubcmd("add")?.name).toBe("add");
        expect(manager.commands.some(command => command.name === "orphan")).toBe(false);

        const parent = manager.searchCommands("tag");
        expect(manager.deleteCommand(parent)).toBe(true);
        expect(manager.commands.map(command => command.name)).toEqual(["alpha"]);
        expect(manager.deleteCommands()).toBe(1);
        expect(manager.commands).toEqual([]);
        manager = null;
    });

    test("reloads commands from disk through the real loader lifecycle", async () => {
        await writeCommand(
            "alpha.js",
            'class AlphaCommand { static info = { name: "alpha", prefix: "!", description: "A" }; async handler() { return "a"; } }\n\nexport default AlphaCommand;'
        );

        manager = new TestManager(true, tempDir);
        await manager.load();
        expect(manager.searchCommands("alpha")).not.toBeNull();

        await writeCommand(
            "beta.js",
            'class BetaCommand { static info = { name: "beta", prefix: "!", description: "B" }; async handler() { return "b"; } }\n\nexport default BetaCommand;'
        );

        await manager.reloadCommands();
        expect(manager.searchCommands("alpha")).not.toBeNull();
        expect(manager.searchCommands("beta")).not.toBeNull();
    });
});

describe("Merged Branch Coverage", () => {
    let runtime;
    let BaseCommandManager;
    let TextCommand;
    let TestManager;

    function createCommand(name, options = {}) {
        const command = {
            info: {
                name,
                subcommands: options.subcommands ?? [],
                parent: options.parent ?? null
            },
            name,
            parent: options.parent ?? null,
            subcommands: options.subcommands ?? [],
            subcommand: options.subcommand ?? false,
            subcmds: options.subcmds ?? [],
            parentCmd: options.parentCmd ?? null,
            bound: options.bound ?? false,
            matches: other => other === name,
            equivalent: other => other.name === name,
            subcmdOf: (parent, subName) =>
                command.subcommand &&
                (command.parentCmd?.name ?? command.parent) === parent.name &&
                subName === name,
            addSubcommand: vi.fn(subcmd => {
                command.subcmds.push(subcmd);
                subcmd.bound = true;
                subcmd.parentCmd = command;
            }),
            removeSubcommand: vi.fn(subcmd => {
                command.subcmds = command.subcmds.filter(other => other !== subcmd);
            }),
            removeSubcommands: vi.fn(() => {
                command.subcmds = [];
            }),
            getSubcmds: () => command.subcmds.slice(),
            getName: (_full = true, sep = " ") =>
                command.subcommand ? `${command.parentCmd?.name ?? command.parent ?? "parent"}${sep}${name}` : name
        };

        return command;
    }

    beforeEach(async () => {
        runtime = await createRuntime({
            loadManagers: false,
            loadVMs: false,
            config: {
                wrapEvents: false
            }
        });

        ({ default: BaseCommandManager } = await import("../../../src/managers/command/BaseCommandManager.js"));
        ({ default: TextCommand } = await import("../../../src/structures/command/TextCommand.js"));

        TestManager = class TestManager extends BaseCommandManager {
            static $name = "testCommandManager";
            static commandClass = TextCommand;
        };
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await cleanupRuntime(runtime);
        runtime = null;
    });

    describe("BaseCommandManager branch coverage", () => {
        test("covers command deletion and subcommand binding edge cases", () => {
            const manager = new TestManager(true, runtime.tempDir);

            manager._commandLoader = {
                loaded: false,
                deleteCommands: vi.fn()
            };

            expect(manager.deleteCommands()).toBe(0);
            expect("_commandLoader" in manager).toBe(false);
            expect(manager.getCommands()).toEqual([]);
            expect(manager.searchCommands("missing")).toBeNull();

            const parent = createCommand("tag", {
                    subcommands: ["add"]
                }),
                subcmd = createCommand("add", {
                    subcommand: true,
                    parent: "tag"
                }),
                orphan = createCommand("orphan", {
                    subcommand: true,
                    parent: "ghost"
                });

            manager.commands = [parent, subcmd, orphan];
            manager._commandLoader = {
                loaded: true,
                deleteData: vi.fn(),
                deleteCommands: vi.fn(() => manager.commands.length),
                getPath: vi.fn(() => "fake-command.js")
            };

            expect(manager.bindSubcommand(parent, "missing")).toBe(false);
            expect(manager._bindSubcommands()).toBe(1);
            expect(parent.addSubcommand).toHaveBeenCalledWith(subcmd);
            expect(manager.commands).not.toContain(orphan);
            expect(manager.getCommands()).toEqual([parent]);
            expect(manager.getCommands(true)).toContain(subcmd);
            expect(manager.searchCommands("tag")).toBe(parent);

            expect(() => manager.deleteCommand(subcmd)).toThrow("Can only delete parent commands");
            expect(() => manager.deleteSubcommand(parent)).toThrow("Can only delete subcommands");

            const solo = createCommand("solo");
            expect(manager.deleteSubcommands(solo)).toBe(false);
            expect(() => manager.deleteSubcommands(solo, true)).toThrow("Command has no subcommands");

            const missingSubcmd = createCommand("gone", {
                subcommand: true,
                parentCmd: parent
            });

            expect(() => manager.deleteSubcommand(missingSubcmd, parent, true)).toThrow(
                `Couldn't delete ${parent.name} gone`
            );
            expect(manager.deleteSubcommand(subcmd, parent)).toBe(true);
            expect(parent.removeSubcommand).toHaveBeenCalledWith(subcmd);

            manager.commands = [parent];
            parent.subcmds = [];

            expect(manager.deleteCommand(parent, false)).toBe(true);
            expect(manager._commandLoader.deleteData).toHaveBeenCalledWith(parent, false);
        });

        test("covers duplicate pruning, empty subcommand loads, and failed command loads", async () => {
            const manager = new TestManager(true, runtime.tempDir);

            manager._commandLoader = {
                loaded: true,
                deleteData: vi.fn(),
                getPath: vi.fn(() => "duplicate.js")
            };

            const alpha = createCommand("alpha"),
                duplicateAlpha = createCommand("alpha"),
                parent = createCommand("parent"),
                orphan = createCommand("child", {
                    subcommand: true,
                    parent: "parent",
                    parentCmd: parent
                });

            manager.commands = [alpha, duplicateAlpha, parent, orphan];

            manager._deleteDuplicateCommands();

            expect(manager.commands.map(command => command.name)).toEqual(["alpha", "parent", "child"]);
            expect(manager._bindSubcommands()).toBe(0);
            expect(manager.commands.map(command => command.name)).toEqual(["alpha", "parent"]);
        });
    });
});
