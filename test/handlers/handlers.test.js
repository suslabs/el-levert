import { describe, expect, test } from "vitest";

import * as Handlers from "../../src/handlers/handlers.js";
import CLICommandHandler from "../../src/handlers/misc/CLICommandHandler.js";
import CommandHandler from "../../src/handlers/discord/CommandHandler.js";
import PreviewHandler from "../../src/handlers/discord/PreviewHandler.js";
import ReactionHandler from "../../src/handlers/discord/ReactionHandler.js";
import SedHandler from "../../src/handlers/discord/SedHandler.js";

describe("handlers barrel", () => {
    test("re-exports the real handler classes", () => {
        expect(Handlers).toMatchObject({
            CLICommandHandler,
            CommandHandler,
            PreviewHandler,
            ReactionHandler,
            SedHandler
        });
    });
});
