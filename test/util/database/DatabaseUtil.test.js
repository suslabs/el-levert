import { EventEmitter } from "node:events";

import { describe, expect, test, vi } from "vitest";

import DatabaseUtil from "../../../src/util/database/DatabaseUtil.js";

describe("DatabaseUtil", () => {
    test("registers, removes, and prefixes database events", () => {
        const source = new EventEmitter();
        const target = new EventEmitter();
        const listener = vi.fn();
        const events = {
            one: "open",
            two: "close",
            skip: "promiseError"
        };

        target.on("open", listener);
        DatabaseUtil.registerEvent(source, target, "open");
        source.emit("open", 1, 2);
        expect(listener).toHaveBeenCalledWith(1, 2);

        DatabaseUtil.registerEvents(source, target, events);
        expect(source.listenerCount("promiseError")).toBe(0);

        DatabaseUtil.registerPrefixedEvents(source, target, "db", { only: "ready" });
        target.on("db_ready", listener);
        source.emit("db_ready", "x");
        expect(listener).toHaveBeenCalledWith("x");

        DatabaseUtil.removePrefixedEvents(source, target, "db", { only: "ready" });
        DatabaseUtil.removeEvents(source, target, events);
        DatabaseUtil.removeEvent(source, target, "open");

        expect(source.listenerCount("open")).toBe(0);
        expect(DatabaseUtil.getEventId()).toMatch(/^[0-9a-f]{8}$/);
    });
});
