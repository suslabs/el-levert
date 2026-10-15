import { EventEmitter } from "node:events";

import { describe, expect, test, vi } from "vitest";

import SqliteResult from "../../../src/database/drivers/sqlite/SqliteResult.js";

import DatabaseUtil from "../../../src/util/database/DatabaseUtil.js";
import DatabaseError from "../../../src/errors/DatabaseError.js";

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

    test("wraps and routes errors", async () => {
        const target = new EventEmitter();
        const errors = [];
        const wrapped = DatabaseUtil.wrapError(new Error("boom"));

        target.on("promiseError", err => errors.push(err.message));

        expect(wrapped).toBeInstanceOf(DatabaseError);
        expect(DatabaseUtil.wrapError(wrapped)).toBe(wrapped);

        expect(() => {
            DatabaseUtil.checkSync(target, "promiseError", true, wrapped);
        }).toThrow("boom");

        expect(
            DatabaseUtil.throwAsync(
                target,
                "promiseError",
                false,
                () => {},
                () => {},
                null
            )
        ).toBe(false);
        expect(await DatabaseUtil.throwPromise(target, "promiseError", false, new Error("soft"), "ok")).toBe("ok");
        await expect(DatabaseUtil.throwPromise(target, "promiseError", true, new Error("hard"))).rejects.toThrow(
            "hard"
        );
        expect(errors).toEqual(["boom", "soft", "hard"]);
    });

    test("settles sync errors through an object's sync throw guard", () => {
        const softResolve = vi.fn();
        const softReject = vi.fn();
        const hardResolve = vi.fn();
        const hardReject = vi.fn();

        DatabaseUtil.settleSyncError(
            {
                _throwErrorSync: vi.fn()
            },
            softResolve,
            softReject,
            new Error("soft"),
            "ok"
        );

        DatabaseUtil.settleSyncError(
            {
                _throwErrorSync: vi.fn(err => {
                    throw err;
                })
            },
            hardResolve,
            hardReject,
            new Error("hard")
        );

        expect(softResolve).toHaveBeenCalledWith("ok");
        expect(softReject).not.toHaveBeenCalled();
        expect(hardResolve).not.toHaveBeenCalled();
        expect(hardReject).toHaveBeenCalledWith(expect.objectContaining({ message: "hard" }));
    });

    test("sanitizes SQL fragments through SQLite internals", () => {
        expect(DatabaseUtil.sanitize("it's fine")).toBe("'it''s fine'");
        expect(DatabaseUtil.sanitize(null)).toBe("NULL");
        expect(DatabaseUtil.quoteIdentifier("Items")).toBe('"Items"');
        expect(DatabaseUtil.quoteIdentifier('weird"name')).toBe('"weird""name"');
        expect(DatabaseUtil.quoteIdentifier("Items; DROP TABLE Items")).toBe('"Items; DROP TABLE Items"');

        expect(() => DatabaseUtil.quoteIdentifier("")).toThrow("Identifier must be a non-empty string");
        expect(() => DatabaseUtil.sanitize(1)).toThrow("Argument 0 must be a string or null");
    });

    test("converts database rows to entities via rowEntity", () => {
        class Entity {
            constructor(row) {
                this.name = row.name;
            }
        }

        expect(DatabaseUtil.rowEntity(null, Entity)).toBeNull();
        expect(DatabaseUtil.rowEntity(undefined, Entity)).toBeNull();
        expect(DatabaseUtil.rowEntity({}, Entity)).toBeNull();

        const entity = DatabaseUtil.rowEntity({ name: "test" }, Entity);
        expect(entity).toBeInstanceOf(Entity);
        expect(entity.name).toBe("test");

        const entities = DatabaseUtil.rowEntity([{ name: "e1" }, { name: "e2" }], Entity);
        expect(entities).toHaveLength(2);
        expect(entities[0].name).toBe("e1");
        expect(entities[1].name).toBe("e2");

        const singleResult = new SqliteResult({ name: "s1" }, {});
        const singleEntity = DatabaseUtil.rowEntity(singleResult, Entity);
        expect(singleEntity).toBeInstanceOf(Entity);
        expect(singleEntity.name).toBe("s1");

        const emptyResult = new SqliteResult(undefined, {});
        expect(DatabaseUtil.rowEntity(emptyResult, Entity)).toBeNull();

        const arrayResult = new SqliteResult([{ name: "a1" }, { name: "a2" }], {});
        const arrayEntities = DatabaseUtil.rowEntity(arrayResult, Entity);
        expect(arrayEntities).toHaveLength(2);
        expect(arrayEntities[0].name).toBe("a1");
        expect(arrayEntities[1].name).toBe("a2");
    });
});
