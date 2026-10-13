import { describe, expect, test, vi } from "vitest";

import InteractionDispatcher from "../../src/client/InteractionDispatcher.js";

describe("InteractionDispatcher", () => {
    test("skips bot interactions", async () => {
        const execute = vi.fn();
        const dispatcher = new InteractionDispatcher({
            interactionHandler: { execute }
        });

        const interaction = { user: { id: "bot-1", bot: true } };

        expect(dispatcher.shouldProcess(interaction)).toBe(false);

        await dispatcher.processCreate(interaction);
        expect(execute).not.toHaveBeenCalled();
    });

    test("routes interaction event to interaction handler", async () => {
        const execute = vi.fn().mockResolvedValue(true);
        const dispatcher = new InteractionDispatcher({
            interactionHandler: { execute }
        });

        const interaction = { user: { id: "user-1", bot: false } };

        expect(dispatcher.shouldProcess(interaction)).toBe(true);

        const result = await dispatcher.processCreate(interaction);
        expect(execute).toHaveBeenCalledWith(interaction);
        expect(result).toBe(true);
    });
});
