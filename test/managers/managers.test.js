import { describe, expect, test } from "vitest";

import * as Managers from "../../src/managers/managers.js";
import CLICommandManager from "../../src/managers/command/CLICommandManager.js";
import CommandManager from "../../src/managers/command/CommandManager.js";
import InputManager from "../../src/managers/misc/InputManager.js";
import PermissionManager from "../../src/managers/database/PermissionManager.js";
import ReminderManager from "../../src/managers/database/ReminderManager.js";
import TagManager from "../../src/managers/database/TagManager.js";

describe("managers barrel", () => {
    test("re-exports the real manager classes", () => {
        expect(Managers).toMatchObject({
            CLICommandManager,
            CommandManager,
            InputManager,
            PermissionManager,
            ReminderManager,
            TagManager
        });
    });
});
