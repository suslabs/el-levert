import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../../../setupGlobals.js";

import LoadStatus from "../../../src/loaders/LoadStatus.js";
import CommandLoader from "../../../src/loaders/command/CommandLoader.js";
import TextCommand from "../../../src/structures/command/TextCommand.js";

let tempDir;

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-tests-"));
});

afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("CommandLoader", () => {
    test("loads command modules from disk and ignores commands that opt out during load", async () => {
        const nestedDir = path.join(tempDir, "nested");
        const logger = {
            debug: () => {},
            info: () => {},
            error: () => {},
            warn: () => {},
            log: () => {}
        };

        await fs.mkdir(nestedDir);
        await fs.writeFile(
            path.join(tempDir, "alpha.js"),
            'class AlphaCommand { static info = { name: "alpha", description: "Alpha" }; async handler() { return "ok"; } }\n\nexport default AlphaCommand;\n'
        );
        await fs.writeFile(
            path.join(nestedDir, "beta.js"),
            'class BetaCommand { static info = { name: "beta", aliases: ["b"] }; async handler() { return "beta"; } }\n\nexport default BetaCommand;\n'
        );
        await fs.writeFile(
            path.join(tempDir, "skip.js"),
            'class SkipCommand { static info = { name: "skip" }; load() { return false; } async handler() { return "skip"; } }\n\nexport default SkipCommand;\n'
        );

        const loader = new CommandLoader(tempDir, logger, {
            commandClass: TextCommand
        });

        await expect(loader.load()).resolves.toEqual([expect.any(Array), LoadStatus.successful]);
        expect(loader.commands.map(command => command.name).sort()).toEqual(["alpha", "beta"]);
        expect(loader.deleteCommands()).toBe(2);
    });
});
