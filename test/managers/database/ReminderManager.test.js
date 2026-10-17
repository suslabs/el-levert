import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let Reminder;
let ReminderManager;
let managers = [];

async function createManager(enabled = true) {
    const manager = new ReminderManager(enabled);
    managers.push(manager);

    if (enabled) {
        await manager.load();
    }

    return manager;
}

beforeEach(async () => {
    managers = [];

    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false
    });

    Reminder = (await import("../../../src/structures/Reminder.js")).default;
    ReminderManager = (await import("../../../src/managers/database/ReminderManager.js")).default;

    runtime.client.findUserById = id => ({
        id,
        username: `name-${id}`,
        send: vi.fn()
    });
}, 30000);

afterEach(async () => {
    try {
        await vi.runAllTimersAsync();
    } catch (_) {}

    vi.useRealTimers();

    for (const manager of managers ?? []) {
        manager?._stopSendLoop();
        await manager?.unload();
    }

    await cleanupRuntime(runtime);
});

describe("ReminderManager", () => {
    test("uses the real sqlite database for reminder lifecycle operations", async () => {
        const manager = await createManager();
        const now = Date.now();

        expect(manager.checkIndex(0)).toBe(0);
        expect(manager.checkMessage(null)).toBeNull();
        expect(manager.checkMessage(123, false)).toEqual(["123", null]);
        expect(manager.checkMessage("  hello  ")).toBe("hello");

        const first = await manager.add("u1", now + 1000, "first", true);
        await manager.add("u1", now + 500, "second", true);
        await manager.add("u2", now + 1500, "other", true);

        expect(first).toBeInstanceOf(Reminder);
        expect(await manager.exists("u1")).toBe(true);
        expect(await manager.exists("ghost")).toBe(false);
        expect(await manager.exists(["u1", "ghost", "u2"])).toEqual([true, false, true]);
        expect((await manager.list("u1")).map(reminder => reminder.msg)).toEqual(["second", "first"]);

        const removed = await manager.remove("u1", 0, true);
        expect(removed.msg).toBe("second");
        await expect(manager.remove("u1", 4, true)).rejects.toThrow("Reminder doesn't exist");

        expect(await manager.removeAll("missing")).toBe(false);
        expect(await manager.removeAll("u2")).toBe(true);
        expect(await manager.exists("u2")).toBe(false);
        await expect(manager.add("u6", now - 1, "late", true)).rejects.toThrow("Invalid end time");
        await expect(manager.add("u6", Number.NaN, "late", true)).rejects.toThrow("Invalid end time");
    });

    test("covers loop, disabled, and stale-removal paths", async () => {
        vi.useFakeTimers({
            toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"]
        });

        const manager = await createManager();
        const now = Date.now();

        expect(await manager.remove("nobody", 0, false)).toBeNull();

        manager.list = () => [new Reminder({ id: 999, user: "ghost", end: now, msg: "ghost" })];
        const stale = await manager.remove("ghost", 0, false);
        expect(stale.msg).toBe("ghost");

        manager.list = ReminderManager.prototype.list.bind(manager);

        ReminderManager.areWeChecking = true;
        const debugSpy = vi.spyOn(runtime.client.logger, "debug").mockImplementation(() => runtime.client.logger);
        await manager._sendReminders();
        expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining("No reminders"));

        await manager.add("u7", now - 10, "due", false);
        const sendSpy = vi.fn();
        runtime.client.findUserById = () => ({
            id: "u7",
            username: "name-u7",
            send: sendSpy
        });

        await manager._sendReminders();
        expect(sendSpy).toHaveBeenCalledTimes(1);
        expect(await manager.list("u7")).toBeNull();

        manager.startSendLoop();
        expect(manager._sendTimer).not.toBeNull();
        manager._stopSendLoop();
        expect(manager._sendTimer).toBeNull();

        const disabled = await createManager(false);
        expect(await disabled.exists("u7")).toBe(false);
        disabled.startSendLoop();
        expect(disabled._sendTimer).toBeNull();
    });

    test("rolls back past-reminder cleanup when a later delete fails", async () => {
        const manager = await createManager();
        const now = Date.now();

        const first = await manager.add("u1", now - 100, "first", false);
        const second = await manager.add("u2", now - 50, "second", false);

        const originalRemove = manager.remind_db.remove;
        let removeCount = 0;

        manager.remind_db.remove = vi.fn(async function (reminder) {
            removeCount++;

            if (removeCount === 2) {
                throw new Error("remove failed");
            }

            return await originalRemove.call(this, reminder);
        });

        await expect(manager.getPastReminders(now)).rejects.toThrow("remove failed");

        expect(
            (await manager.listAll()).map(reminder => ({
                user: reminder.user,
                msg: reminder.msg
            }))
        ).toEqual([
            {
                user: first.user,
                msg: first.msg
            },
            {
                user: second.user,
                msg: second.msg
            }
        ]);
    });

    test("handles recurring reminders advancing schedule on trigger", async () => {
        const manager = await createManager();
        const now = Date.now();
        const interval = 60_000;

        const recurring = await manager.add("u1", now - 100, "recurring", false, interval);
        expect(recurring.isRecurring).toBe(true);
        expect(recurring.interval).toBe(interval);

        const past = await manager.getPastReminders(now);
        expect(past).toHaveLength(1);
        expect(past[0].msg).toBe("recurring");

        const remaining = await manager.list("u1");
        expect(remaining).toHaveLength(1);
        expect(remaining[0].end).toBeGreaterThan(now);
        expect(remaining[0].end).toBe(now - 100 + interval);
    });

    test("snoozes active and delivered reminders seamlessly", async () => {
        const manager = await createManager();
        const now = Date.now();

        await expect(manager.snooze("u1", 0, -100)).rejects.toThrow("Invalid snooze duration");
        await expect(manager.snooze("nobody", 0, 60_000)).rejects.toThrow("No reminders to snooze");

        const added = await manager.add("u1", now + 10_000, "snooze me", false);
        const snoozed = await manager.snooze("u1", 0, 30_000);
        expect(snoozed.end).toBeGreaterThanOrEqual(now + 40_000);

        const snoozedDirect = await manager.snooze("u1", snoozed, 10_000);
        expect(snoozedDirect.end).toBe(snoozed.end + 10_000);

        await manager.remove("u1", 0);

        manager._lastSentReminders.set("u1", added);
        const snoozedLast = await manager.snooze("u1", null, 60_000);
        expect(snoozedLast.msg).toBe("snooze me");
        expect(snoozedLast.end).toBeGreaterThanOrEqual(now + 60_000);
    });
});
