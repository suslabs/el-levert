import { describe, expect, test, vi } from "vitest";

import BotEvent from "../../src/structures/BotEvent.js";

describe("BotEvent", () => {
    test("registers and unregisters event listeners", () => {
        const listener = vi.fn();
        const client = {
            on: vi.fn(),
            once: vi.fn(),
            removeListener: vi.fn()
        };
        const event = new BotEvent({
            name: "ready",
            once: true,
            listener
        });

        event.register(client);

        expect(client.once).toHaveBeenCalledWith("ready", listener);
        expect(() => event.register(client)).toThrow("already been registered");

        event.unregister();

        expect(client.removeListener).toHaveBeenCalledWith("ready", listener);
        expect(() => event.unregister()).toThrow("hasn't been registered");
    });

    test("validates constructor fields and serializes event data", () => {
        expect(() => new BotEvent({ listener: () => {} })).toThrow("Event must have a name");
        expect(() => new BotEvent({ name: "ready" })).toThrow("Event must have a listener function");

        const event = new BotEvent({
            name: "messageCreate",
            listener: () => {},
            once: false
        });

        expect(event.getData("$", true, ["name", "once"])).toEqual({
            $name: "messageCreate",
            $once: false
        });

        const client = {
            on: vi.fn(),
            once: vi.fn(),
            removeListener: vi.fn()
        };
        event.client = client;
        event.register();
        expect(client.on).toHaveBeenCalled();
    });
});
