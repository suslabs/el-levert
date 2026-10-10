import { describe, expect, test, vi } from "vitest";

import ProgressTracker from "../../../src/util/misc/ProgressTracker.js";

describe("ProgressTracker", () => {
    test("initializes with default options and handles custom options", () => {
        const stream = {
            write: vi.fn(),
            isTTY: false
        };

        const tracker = new ProgressTracker(50, {
            stream,
            width: 20,
            showPercent: false,
            showCount: false,
            completeChar: "#",
            headChar: ">",
            incompleteChar: "-",
            bracketLeft: "{",
            bracketRight: "}"
        });

        expect(tracker.totalWork).toBe(50);
        expect(tracker.width).toBe(20);
        expect(tracker.showPercent).toBe(false);
        expect(tracker.showCount).toBe(false);
        expect(tracker.completeChar).toBe("#");
        expect(tracker.bracketLeft).toBe("{");
        expect(tracker.bracketRight).toBe("}");
    });

    test("emits progress callbacks and calculates percentage and rate", () => {
        const events = [];
        const tracker = new ProgressTracker(100, {
            render: false,
            callbacks: {
                onProgress: ev => events.push(ev)
            }
        });

        expect(events.length).toBe(1);
        expect(events[0].percentage).toBe(0);
        expect(events[0].totalWork).toBe(100);
        expect(events[0].completed).toBe(false);

        tracker.update(50);
        expect(tracker.completedWork).toBe(50);
        expect(tracker.percentage).toBe(50);
        expect(events.length).toBe(2);
        expect(events[1].percentage).toBe(50);

        tracker.complete();
        expect(tracker.completed).toBe(true);
        expect(events.length).toBe(3);
        expect(events[2].percentage).toBe(100);
        expect(events[2].completed).toBe(true);
    });

    test("renders non-TTY progress output at step intervals and at 100 percent", () => {
        const writes = [];
        const stream = {
            write: chunk => writes.push(chunk),
            isTTY: false
        };

        const tracker = new ProgressTracker({
            stream,
            width: 10,
            step: 20
        });

        tracker.start(100, "Starting");
        expect(writes.length).toBe(1);
        expect(writes[0]).toContain("[          ]");
        expect(writes[0]).toContain("0%");
        expect(writes[0]).toContain("(0/100)");
        expect(writes[0]).toContain("Starting");

        tracker.tick(10);
        expect(writes.length).toBe(1);

        tracker.tick(10);
        expect(writes.length).toBe(2);
        expect(writes[1]).toContain("20%");

        tracker.setLabel("Halfway");
        tracker.update(30);
        expect(writes.length).toBe(3);
        expect(writes[2]).toContain("50%");
        expect(writes[2]).toContain("Halfway");

        tracker.update(50);
        expect(writes.length).toBe(4);
        expect(writes[3]).toContain("100%");

        tracker.finish("Done!");
        expect(writes[writes.length - 1]).toBe("Done!\n");
    });

    test("renders TTY progress output and clears line", () => {
        const writes = [];
        const stream = {
            write: chunk => writes.push(chunk),
            isTTY: true
        };

        const tracker = new ProgressTracker({
            stream,
            width: 10
        });

        tracker.start(10, "TTY test");
        expect(tracker.completed).toBe(false);
        expect(writes.length).toBeGreaterThan(0);

        tracker.tick(5, "Half");
        expect(tracker.completedWork).toBe(5);
        expect(tracker.label).toBe("Half");

        tracker.clear();

        tracker.finish();
        expect(tracker.completed).toBe(true);
    });

    test("handles zero total and boundaries gracefully", () => {
        const writes = [];
        const stream = {
            write: chunk => writes.push(chunk),
            isTTY: false
        };

        const tracker = new ProgressTracker({
            stream
        });

        tracker.start(0, "Zero");
        expect(tracker.totalWork).toBe(0);
        expect(tracker.percentage).toBe(100);

        tracker.tick(5);
        expect(tracker.completedWork).toBe(5);

        tracker.finish();
    });
});
