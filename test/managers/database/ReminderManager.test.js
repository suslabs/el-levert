import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import Util from "../../../src/util/Util.js";

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
        send: vi.fn(async () => ({ components: [] }))
    });
}, 30000);

afterEach(async () => {
    try {
        await vi.runAllTimersAsync();
    } catch (_) {}

    vi.useRealTimers();

    for (const manager of managers) {
        await manager.unload();
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
        expect((await manager.list({ user: "u1" }, { all: true })).items.map(reminder => reminder.msg)).toEqual([
            "second",
            "first"
        ]);

        const removed = await manager.remove("u1", 0, true);
        expect(removed.msg).toBe("second");
        await expect(manager.remove("u1", 4, true)).rejects.toThrow("Reminder doesn't exist");

        const edited = await manager.edit("u1", 0, now + 3000, 60000, true);
        expect(edited.msg).toBe("first");
        expect(edited.start).toBe(now + 3000);
        expect(edited.interval).toBe(60000);

        const cleared = await manager.edit("u1", 0, null, null, true);
        expect(cleared.interval).toBeNull();

        await expect(manager.edit("u1", 0, now - 1, undefined, true)).rejects.toThrow("Invalid start time");
        await expect(manager.edit("u1", 0, null, -5, true)).rejects.toThrow("Invalid reminder interval");
        await expect(manager.edit("u1", 99, null, 60000, true)).rejects.toThrow("Reminder doesn't exist");

        expect(await manager.removeAll("missing")).toBe(false);
        expect(await manager.removeAll("u2")).toBe(true);
        expect(await manager.exists("u2")).toBe(false);
        await expect(manager.add("u6", now - 1, "late", true)).rejects.toThrow("Invalid start time");
        await expect(manager.add("u6", Number.NaN, "late", true)).rejects.toThrow("Invalid start time");
    });

    test("covers loop, disabled, and stale-removal paths", async () => {
        vi.useFakeTimers({
            toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"]
        });

        const manager = await createManager();
        const now = Date.now();

        expect(await manager.remove("nobody", 0, false)).toBeNull();

        manager.list = () => ({
            items: [new Reminder({ id: 999, user: "ghost", start: now, msg: "ghost" })],
            totalCount: 1
        });
        const stale = await manager.remove("ghost", 0, false);
        expect(stale.msg).toBe("ghost");

        manager.list = ReminderManager.prototype.list.bind(manager);

        ReminderManager.areWeChecking = true;
        const debugSpy = vi.spyOn(runtime.client.logger, "debug").mockImplementation(() => runtime.client.logger);
        await manager._sendReminders();
        expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining("No reminders"));

        await manager.add("u7", now - 10, "due", false);
        const sendSpy = vi.fn(async () => ({ components: [] }));
        runtime.client.findUserById = () => ({
            id: "u7",
            username: "name-u7",
            send: sendSpy
        });

        await manager._sendReminders();
        expect(sendSpy).toHaveBeenCalledTimes(1);
        expect(await manager.list({ user: "u7" })).toEqual({ items: [], totalCount: 0 });

        manager.startSendLoop();
        expect(manager._sendLoop.running).toBe(true);
        await manager._sendLoop.stop();
        expect(manager._sendLoop.running).toBe(false);

        const disabled = await createManager(false);
        expect(await disabled.exists("u7")).toBe(false);
        disabled.startSendLoop();
        expect(disabled._sendLoop.running).toBe(false);
    });

    test("rolls back past-reminder cleanup when a later delete fails", async () => {
        const manager = await createManager();
        const now = Date.now();

        const first = await manager.add("u1", now - 100, "first", false, 10, now - 50);
        const second = await manager.add("u2", now - 50, "second", false, 10, now - 10);

        manager._lastSentOccurrences.set(first.id, 5);
        manager._lastSentOccurrences.set(second.id, 4);

        const originalRemove = manager.remind_db.removeScheduled;
        let removeCount = 0;

        manager.remind_db.removeScheduled = vi.fn(async function (reminder) {
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

    test("keeps the recurrence anchor static when an occurrence is due", async () => {
        const manager = await createManager();
        const now = Date.now();
        const interval = 60_000;

        const recurring = await manager.add("u1", now - 100, "recurring", false, interval);
        expect(recurring.isRecurring).toBe(true);
        expect(recurring.interval).toBe(interval);

        const past = await manager.getPastReminders(now);
        expect(past).toHaveLength(1);
        expect(past[0].reminder.msg).toBe("recurring");

        const { items: remaining } = await manager.list({ user: "u1" }, { all: true });
        expect(remaining).toHaveLength(1);
        expect(remaining[0].start).toBe(now - 100);
        expect(remaining[0].end).toBeNull();
    });

    test("sends each recurring occurrence once while leaving the schedule unchanged", async () => {
        const manager = await createManager();
        const now = Date.now();
        const interval = 60_000;
        const send = vi.fn(async () => ({ components: [] }));

        runtime.client.findUserById = () => ({ id: "u1", username: "name-u1", send });

        const reminder = await manager.add("u1", now - 100, "recurring", false, interval);
        await manager._sendReminders();
        await manager._sendReminders();

        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0].content).toContain("next occurrence");
        expect((await manager.remind_db.fetchById(reminder.id)).start).toBe(reminder.start);
    });

    test("does not resend a delivered reminder if removing it fails", async () => {
        const manager = await createManager();
        const send = vi.fn(async () => ({ components: [] }));
        runtime.client.findUserById = () => ({ id: "u1", username: "name-u1", send });

        const reminder = await manager.add("u1", Date.now() - 1, "once", false);
        vi.spyOn(manager.remind_db, "removeScheduled").mockRejectedValueOnce(new Error("remove failed"));

        await expect(manager._sendReminders()).rejects.toThrow("remove failed");
        await manager._sendReminders();

        expect(send).toHaveBeenCalledTimes(1);
        expect(await manager.remind_db.fetchById(reminder.id)).toBeNull();
    });

    test("sends the final recurrence and removes the completed reminder", async () => {
        const manager = await createManager();
        const now = Date.now();
        const interval = Util.durationSeconds.minute / Util.durationSeconds.milli;
        const send = vi.fn(async () => ({ components: [] }));
        runtime.client.findUserById = () => ({ id: "u1", username: "name-u1", send });

        const reminder = await manager.add("u1", now - interval, "final", false, interval, now);
        await manager._sendReminders();
        await manager._sendReminders();

        expect(send).toHaveBeenCalledTimes(1);
        expect(await manager.remind_db.fetchById(reminder.id)).toBeNull();
    });

    test("keeps a reminder edited while its previous occurrence is being sent", async () => {
        const manager = await createManager();

        let release;
        const pending = new Promise(resolve => {
            release = resolve;
        });

        let notifyStart;
        const started = new Promise(resolve => {
            notifyStart = resolve;
        });

        const send = vi.fn(async () => {
            notifyStart();
            await pending;
            return { components: [] };
        });
        runtime.client.findUserById = () => ({ id: "u1", username: "name-u1", send });

        const reminder = await manager.add("u1", Date.now() - 1, "edit during send", false);
        const sending = manager._sendReminders();
        await started;

        const next = Date.now() + Util.durationSeconds.hour / Util.durationSeconds.milli;
        await manager.edit("u1", 0, next);
        release();
        await sending;

        const saved = await manager.remind_db.fetchById(reminder.id);
        expect(saved.start).toBe(next);
        expect(send).toHaveBeenCalledTimes(1);
    });

    test("snoozes one recurring occurrence without changing its schedule", async () => {
        const manager = await createManager();
        const now = Date.now();
        const day = Util.durationSeconds.day / Util.durationSeconds.milli,
            minute = Util.durationSeconds.minute / Util.durationSeconds.milli;

        const reminder = await manager.add("u1", now + day, "recurring", false, "1D");
        const snoozed = await manager.snooze("u1", reminder, minute);

        const send = vi.fn(async () => ({ components: [] }));
        runtime.client.findUserById = () => ({ id: "u1", username: "name-u1", send });

        const clock = vi.spyOn(Date, "now").mockReturnValue(snoozed.start + 1);

        try {
            await manager._sendReminders();
            await manager._sendReminders();
        } finally {
            clock.mockRestore();
        }

        const saved = await manager.remind_db.fetchById(reminder.id);

        expect(snoozed.id).not.toBe(reminder.id);
        expect(snoozed.interval).toBeNull();
        expect(send).toHaveBeenCalledOnce();
        expect(send.mock.calls[0][0].content).not.toContain("(every ");
        expect(await manager.remind_db.fetchById(snoozed.id)).toBeNull();
        expect(saved.start).toBe(reminder.start);
        expect(saved.interval).toBe("1D");
    });

    test("snoozes active and delivered reminders seamlessly", async () => {
        const manager = await createManager();
        const now = Date.now();

        await expect(manager.snooze("u1", 0, -100)).rejects.toThrow("Invalid snooze duration");
        await expect(manager.snooze("nobody", 0, 60_000)).rejects.toThrow("No reminders to snooze");

        const added = await manager.add("u1", now + 10_000, "snooze me", false);
        const snoozed = await manager.snooze("u1", 0, 30_000);
        expect(snoozed.start).toBeGreaterThanOrEqual(now + 40_000);

        const snoozedDirect = await manager.snooze("u1", snoozed, 10_000);
        expect(snoozedDirect.start).toBe(snoozed.start + 10_000);

        await manager.remove("u1", 0);

        manager._lastSentReminders.set("u1", added);
        const snoozedLast = await manager.snooze("u1", null, 60_000);
        expect(snoozedLast.msg).toBe("snooze me");
        expect(snoozedLast.start).toBeGreaterThanOrEqual(now + 60_000);
    });
});
