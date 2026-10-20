import { describe, expect, test } from "vitest";

import "../../setupGlobals.js";

import SqliteResult from "../../src/database/drivers/sqlite/SqliteResult.js";
import Revision from "../../src/structures/revision/Revision.js";
import RevisionSubject from "../../src/structures/revision/RevisionSubject.js";

import Util from "../../src/util/Util.js";
import RevisionUtil from "../../src/util/RevisionUtil.js";

describe("RevisionUtil", () => {
    test("converts database rows to RevisionSubject and Revision", () => {
        expect(RevisionUtil.subject(null)).toBeNull();
        expect(RevisionUtil.revision(null)).toBeNull();

        const subjectRow = new SqliteResult(
            {
                id: 1,
                target: "tag",
                key: '{"name":"alpha"}',
                staticSnapshot: '{"registered":100}',
                active: 1,
                deleted: null,
                created: 100
            },
            {}
        );

        const subject = RevisionUtil.subject(subjectRow);
        expect(subject).toBeInstanceOf(RevisionSubject);
        expect(subject.target).toBe("tag");
        expect(subject.key).toEqual({ name: "alpha" });

        const revRow = new SqliteResult(
            {
                id: 10,
                target: "tag",
                subjectId: 1,
                operation: "create",
                actor: "u1",
                created: 100,
                key: '{"name":"alpha"}',
                changed: '["body"]',
                snapshot: '{"name":"alpha","body":"text"}',
                revertOf: null,
                restores: null,
                reason: null,
                subjectIndex: 1
            },
            {}
        );

        const rev = RevisionUtil.revision(revRow);
        expect(rev).toBeInstanceOf(Revision);
        expect(rev.actor).toBe("u1");
        expect(rev.changed).toEqual(["body"]);
    });

    test("diffs snapshots and detects changed fields correctly", () => {
        const before = { name: "alpha", body: "v1", count: 1 };
        const after = { name: "alpha", body: "v2", count: 1, extra: "yes" };

        expect(Util.sameValue(1, 1)).toBe(true);
        expect(Util.sameValue({ a: 1 }, { a: 1 })).toBe(true);
        expect(Util.sameValue({ a: 1 }, { a: 2 })).toBe(false);

        const diff = RevisionUtil.diff(before, after);
        expect(diff).toEqual({
            body: { before: "v1", after: "v2" },
            extra: { before: undefined, after: "yes" }
        });

        expect(RevisionUtil.changedFields(before, after)).toEqual(["body", "extra"]);
        expect(RevisionUtil.changedFields(null, after)).toEqual(["name", "body", "count", "extra"]);
    });

    test("restores snapshots combining static and revision snapshot", () => {
        const subject = {
            staticSnapshot: { registered: 100 }
        };
        const revision = {
            snapshot: { name: "alpha", body: "hello" }
        };

        const restored = RevisionUtil.restoreSnapshot(subject, revision);
        expect(restored).toEqual({
            registered: 100,
            name: "alpha",
            body: "hello"
        });

        const withDecoder = RevisionUtil.restoreSnapshot(subject, revision, (k, v) =>
            typeof v === "string" ? v.toUpperCase() : v
        );
        expect(withDecoder).toEqual({
            registered: 100,
            name: "ALPHA",
            body: "HELLO"
        });

        expect(RevisionUtil.restoreSnapshot(subject, { snapshot: null })).toBeNull();
    });
});
