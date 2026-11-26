import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import BaseLimiter from "../../../src/util/misc/BaseLimiter.js";
import TimedStore from "../../../src/util/misc/TimedStore.js";

class TestStore extends TimedStore {
    constructor(options) {
        super(options);
        this.expired = [];
    }

    sweepItems() {
        for (const [id, item] of this.items) {
            if (item.expired) {
                this.removeItem(id);
                this.expired.push(id);
            }
        }
    }
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("TimedStore & BaseLimiter", () => {
    test("stores items by raw or object id and supports CRUD, clear, and sweep lifecycle", () => {
        const store = new TestStore({ sweepInterval: 50 });

        expect(store.size).toBe(0);
        expect(store.findItem(null)).toBeNull();
        expect(store.has("a")).toBe(false);

        const entry = { id: "a", expired: true };
        store.items.set("a", entry);
        expect(store.hasItem(entry)).toBe(true);
        expect(store.getItem(entry)).toBe(entry);
        expect(store.size).toBe(1);

        vi.advanceTimersByTime(50);
        expect(store.has("a")).toBe(false);
        expect(store.expired).toEqual(["a"]);

        store.items.set("b", { id: "b" });
        expect(store.removeItem({ id: "b" })).toEqual({ id: "b" });
        expect(store.removeItem("b")).toBeNull();

        store.items.set("c", { id: "c" });
        expect(store.clearItems()).toBe(true);
        expect(store.size).toBe(0);

        expect(store.destroy()).toBeUndefined();
        expect(store._sweepLoop.running).toBe(false);
    });

    test("supports static from on TimedStore subclasses and BaseLimiter call guards", () => {
        const store = TimedStore.from({ sweepInterval: 0 });
        expect(store).toBeInstanceOf(TimedStore);
        expect(TimedStore.from(store)).toBe(store);
        expect(TimedStore.from(null, true)).toBeNull();

        const base = new BaseLimiter();
        expect(base.enableSweep).toBe(false);
        expect(base._sweepLoop).toBeNull();
        expect(() => base.execute("bad")).toThrow("Function must be provided to execute");
        expect(() => base.wrap("bad")).toThrow("Function must be provided to wrap");
        expect(base.execute(() => "blocked")).toBe(false);
        expect(base.reset()).toBe(true);

        const disabledSweep = new TestStore({ sweepInterval: 50, enableSweep: false });
        expect(disabledSweep.enableSweep).toBe(false);
        expect(disabledSweep._sweepLoop).toBeNull();
        disabledSweep.items.set("x", { id: "x", expired: true });
        disabledSweep.sweepItems();
        vi.advanceTimersByTime(100);
        expect(disabledSweep.has("x")).toBe(true);
    });
});
