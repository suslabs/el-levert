import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let Reminder;
let ReminderManager;
let managers;

async function createManager(enabled = true) {
    const manager = new ReminderManager(enabled);
    managers.push(manager);

    if (enabled) {
        await manager.load();
    }

    return manager;
}

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false
    });

    Reminder = (await import("../../../src/structures/Reminder.js")).default;
    ReminderManager = (await import("../../../src/managers/database/ReminderManager.js")).default;

    managers = [];

    runtime.client.findUserById = async id => ({
        id,
        username: `name-${id}`,
        send: vi.fn()
    });
});

afterEach(async () => {
    vi.useRealTimers();

    for (const manager of managers) {
        manager?._stopSendLoop?.();
        await manager?.unload?.();
    }

    await cleanupRuntime(runtime);
});

describe("ReminderManager", () => {
    test("uses the real sqlite database for reminder lifecycle operations", async () => {
        const manager = await createManager();
        const now = Date.now();

        expect(manager.checkIndex(0)).toBe(0);
        expect(manager.checkMessage("  hello  ")).toBe("hello");

        const first = await manager.add("u1", now + 1000, "first", true);
        const second = await manager.add("u1", now + 500, "second", true);
        await manager.add("u2", now + 1500, "other", true);

        expect(first).toBeInstanceOf(Reminder);
        expect((await manager.list("u1")).map(reminder => reminder.msg)).toEqual(["second", "first"]);

        const removed = await manager.remove("u1", 0, true);
        expect(removed.msg).toBe("second");
        await expect(manager.remove("u1", 4, true)).rejects.toThrow("Reminder doesn't exist");

        expect(await manager.removeAll("missing")).toBe(false);
        expect(await manager.removeAll("u2")).toBe(true);
        await expect(manager.add("u6", now - 1, "late", true)).rejects.toThrow("Invalid end time");
    });

    test("covers loop, disabled, and stale-removal paths", async () => {
        vi.useFakeTimers();

        const manager = await createManager();
        const now = Date.now();

        expect(await manager.remove("nobody", 0, false)).toBeNull();

        manager.list = async () => [new Reminder({ id: 999, user: "ghost", end: now, msg: "ghost" })];
        const stale = await manager.remove("ghost", 0, false);
        expect(stale.msg).toBe("ghost");

        manager.list = ReminderManager.prototype.list.bind(manager);

        ReminderManager.areWeChecking = true;
        const debugSpy = vi.spyOn(runtime.client.logger, "debug").mockImplementation(() => runtime.client.logger);
        await manager._sendReminders();
        expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining("No reminders"));

        await manager.add("u7", now - 10, "due", false);
        const sendSpy = vi.fn();
        runtime.client.findUserById = async () => ({
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
        disabled.startSendLoop();
        expect(disabled._sendTimer).toBeNull();
    });
});
