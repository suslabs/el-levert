import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";
import ConfigLoader from "../../../src/loaders/config/ConfigLoader.js";

let runtime;
let tempDir;
let PermissionManager;
let CommandManager;
let permManager;
let manager;

async function writeCommand(relPath, source) {
    const filePath = path.join(tempDir, relPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, source);
}

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false,
        config: {
            wrapEvents: false,
            cmdPrefix: "!",
            bridgeBotIds: ["bridge"],
            bridgeBotMessageFormat: "bridge (?<content>)",
            maxGroupNameLength: 16,
            tagModeratorLevel: 5,
            permissionAdminLevel: 8
        }
    });

    tempDir = path.join(runtime.tempDir, "commands");
    await fs.mkdir(tempDir, { recursive: true });

    runtime.client.config.commandsPath = tempDir;
    runtime.client.config.cliCommandsPath = path.join(tempDir, "cli");
    new ConfigLoader(runtime.client.logger)._setBridgeBotConfig(runtime.client.config);
    runtime.client._setOtherConfigs();

    ({ default: PermissionManager } = await import("../../../src/managers/database/PermissionManager.js"));
    ({ default: CommandManager } = await import("../../../src/managers/command/CommandManager.js"));

    permManager = new PermissionManager(true);
    runtime.client.permManager = permManager;
    await permManager.load();
});

afterEach(async () => {
    manager?.unload?.();
    await permManager?.unload?.();
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("CommandManager", () => {
    test("loads real command files, supports bridge-bot parsing, and filters by permission", async () => {
        await writeCommand(
            "help.js",
            'class HelpCommand { static info = { name: "help", prefix: "!", description: "Help", category: "info" }; async handler() { return "help"; } }\n\nexport default HelpCommand;'
        );
        await writeCommand(
            "admin.js",
            'class AdminCommand { static info = { name: "admin", prefix: "!", description: "Admin", category: "owner_only", allowed: 5 }; async handler() { return "admin"; } }\n\nexport default AdminCommand;'
        );

        manager = new CommandManager(true);
        await manager.load();

        expect(manager.isCommand("!help", { author: { id: "user" } })).toBe(true);
        expect(manager.isCommand("bridge !help", { author: { id: "bridge" } })).toBe(true);
        expect(manager._getCommandContent("bridge !admin", { author: { id: "bridge" } })).toBe("admin");
        expect(manager.searchCommands("help")?.name).toBe("help");
        expect(manager.getCommands(0).map(command => command.name)).toEqual(["help"]);
        expect(
            manager
                .getCommands(5)
                .map(command => command.name)
                .sort()
        ).toEqual(["admin", "help"]);
        expect(manager.getHelp(0)).toContain("help");
    });
});
