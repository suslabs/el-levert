import { describe, expect, test, vi } from "vitest";
import EventLoader from "../../../src/loaders/event/EventLoader.js";
import "../../../setupGlobals.js";
import LoadStatus from "../../../src/loaders/LoadStatus.js";
import DirectoryLoader from "../../../src/loaders/DirectoryLoader.js";

describe("EventLoader", () => {
    test("wraps, registers, and removes event listeners", () => {
        const event = {
            name: "ready",
            listener: () => {},
            register: vi.fn(),
            unregister: vi.fn()
        };
        const loader = Object.create(EventLoader.prototype);
        loader.data = new Map([["ready", event]]);
        loader.client = {};
        loader.logger = {
            info: vi.fn(),
            warn: vi.fn()
        };
        loader.deleteAllData = vi.fn();
        loader.shouldWrap = true;
        loader.wrapFunc = listener => listener;

        expect(loader._getEvents()).toEqual([event]);
        loader._wrapEvents();
        loader._registerEvents();
        loader.removeListeners();

        expect(event.register).toHaveBeenCalledWith(loader.client);
        expect(event.unregister).toHaveBeenCalled();
    });
});

describe("Merged Branch Coverage", () => {
    describe("EventLoader branches", () => {
        test("returns failed loads immediately and exposes loading messages", async () => {
            const loader = new EventLoader(".", {}, null);
            const loadSpy = vi.spyOn(DirectoryLoader.prototype, "load").mockResolvedValue(LoadStatus.failed);

            await expect(loader.load()).resolves.toEqual([null, LoadStatus.failed]);
            expect(loader.getLoadingMessage()).toBe("Loading events...");
            expect(loader.getLoadedMessage()).toBe("Loaded events successfully.");

            loadSpy.mockRestore();
        });

        test("reuses cached events and warns when wrapping is misconfigured", () => {
            const event = {
                name: "ready",
                listener: () => "listener"
            };

            const loader = Object.create(EventLoader.prototype);
            loader.name = "event";
            loader.events = [event];
            loader.shouldWrap = true;
            loader.failure = vi.fn();

            expect(loader._getEvents()).toBe(loader.events);

            loader._wrapEvent(event);

            expect(loader.failure).toHaveBeenCalledWith("Couldn't wrap event: ready", undefined, "warn");
            expect(event.listener()).toBe("listener");
        });
    });
});
