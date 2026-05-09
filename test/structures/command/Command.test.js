import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

import CommandContext from "../../../src/structures/command/context/CommandContext.js";

let runtime;
let Command;
let TestCommand;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: true,
        loadVMs: false,
        config: {
            tagModeratorLevel: 3,
            permissionAdminLevel: 8
        }
    });

    ({ default: Command } = await import("../../../src/structures/command/Command.js"));

    TestCommand = class TestCommand extends Command {
        async handler(context) {
            return context.perm;
        }
    };
});

afterEach(async () => {
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("Command", () => {
    test("normalizes owner-only permissions in the constructor", () => {
        const ownerLevel = runtime.client.permManager.getLevels().owner;
        const ownerOnly = new TestCommand({
            name: "owner",
            ownerOnly: true
        });
        const allowedAsOwner = new TestCommand({
            name: "admin",
            allowed: "owner"
        });

        expect(ownerOnly.ownerOnly).toBe(true);
        expect(ownerOnly.allowed).toBe(ownerLevel);
        expect(allowedAsOwner.ownerOnly).toBe(true);
        expect(allowedAsOwner.allowed).toBe(ownerLevel);
    });

    test("checks permission levels before executing handlers", async () => {
        const mods = await runtime.client.permManager.addGroup("mods", 3, true);
        await runtime.client.permManager.add(mods, "user", true);

        const command = new TestCommand({
            name: "mod",
            allowed: 2
        });

        await expect(
            command.execute(
                new CommandContext({
                    argsText: "run",
                    message: { author: { id: "user" }, channel: {} }
                })
            )
        ).resolves.toBe(3);

        const denied = new TestCommand({
            name: "restricted",
            allowed: 5
        });
        const ownerDenied = new TestCommand({
            name: "owner",
            ownerOnly: true
        });

        await expect(
            denied.execute(
                new CommandContext({
                    message: { author: { id: "user" }, channel: {} }
                })
            )
        ).resolves.toContain("permission level 5");
        await expect(
            ownerDenied.execute(
                new CommandContext({
                    message: { author: { id: "user" }, channel: {} }
                })
            )
        ).resolves.toContain("Only the bot owner");
    });

    test("filters subcommands by permission and supports direct permission overrides", async () => {
        const admins = await runtime.client.permManager.addGroup("admins", 8, true);
        await runtime.client.permManager.add(admins, "admin-user", true);

        const command = new TestCommand({
            name: "tag"
        });
        const visible = new TestCommand({
            name: "list",
            aliases: ["ls"],
            parent: "tag",
            subcommand: true,
            allowed: 1
        });
        const hidden = new TestCommand({
            name: "delete",
            parent: "tag",
            subcommand: true,
            allowed: 5
        });

        command.addSubcommand(visible);
        command.addSubcommand(hidden);

        expect(command.getSubcmdList(3, false)).toBe("list");
        expect(command.getSubcmdList(8, true).split("|")).toEqual(["delete", "list", "ls"]);

        await expect(Command._getPermLevel(null, { asLevel: 9 })).resolves.toBe(9);
        await expect(Command._getPermLevel(null, { asUser: "owner-id" })).resolves.toBe(
            runtime.client.permManager.getLevels().owner
        );
        await expect(Command._getPermLevel(null, { asUser: "admin-user" })).resolves.toBe(8);
        await expect(Command._getPermLevel(null, {})).resolves.toBe(runtime.client.permManager.getLevels().default);
    });
});
