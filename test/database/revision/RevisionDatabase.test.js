import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../../../setupGlobals.js";

import TagDatabase from "../../../src/database/TagDatabase.js";

import RevisionError from "../../../src/errors/RevisionError.js";

const queryPath = path.resolve(projRoot, "src/database/query/tag");
const migrationsPath = path.resolve(projRoot, "src/database/migrations/tag");

let tempDir;

function createDb(filename = "tags.sqlite") {
    const dbPath = path.join(tempDir, filename);
    return new TagDatabase(dbPath, queryPath, {
        enableWAL: false,
        migrationsPath
    });
}

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-revisions-"));
});

afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("RevisionDatabase", () => {
    test("persists subjects and revisions through query-backed storage", async () => {
        const db = createDb();
        await db.create();
        await db.load();

        const subject = await db.createSubject("tag", { name: "alpha" }, { registered: 1 });

        expect(subject).toMatchObject({
            target: "tag",
            key: { name: "alpha" },
            staticSnapshot: { registered: 1 }
        });

        const revision = await db.addRevision({
            target: "tag",
            subjectId: subject.id,
            operation: "create",
            actor: "u1",
            created: 10,
            key: { name: "alpha" },
            changed: ["body"],
            snapshot: { name: "alpha", body: "one" }
        });

        expect(revision).toMatchObject({
            operation: "create",
            actor: "u1",
            changed: ["body"],
            snapshot: { name: "alpha", body: "one" }
        });

        await db.updateSubjectKey(subject, { name: "beta" });
        expect(await db.fetchSubject("tag", { name: "beta" })).toMatchObject({ id: subject.id });
        expect(await db.fetchSubjectByRevisionKey("tag", { name: "alpha" })).toMatchObject({ id: subject.id });

        await db.markSubjectDeleted(subject, 20);
        expect(await db.fetchSubject("tag", { name: "beta" })).toBeNull();

        await db.restoreSubject(subject, { name: "beta" });
        expect(await db.fetchLatest("tag", subject.id)).toMatchObject({ id: revision.id });
        expect(await db.listRevisions({ target: "tag", actor: "u1", limit: 5 })).toHaveLength(1);

        await db.close();
    });

    test("defaults actor to unknown when omitted or whitespace", async () => {
        const db = createDb();
        await db.create();
        await db.load();

        try {
            const subject = await db.createSubject("tag", { name: "default_actor" }, {});

            const rev1 = await db.addRevision({
                target: "tag",
                subjectId: subject.id,
                operation: "create",
                key: { name: "default_actor" },
                changed: ["body"],
                snapshot: { name: "default_actor", body: "text" }
            });

            expect(rev1.actor).toBe("unknown");

            const rev2 = await db.addRevision({
                target: "tag",
                subjectId: subject.id,
                operation: "update",
                actor: "   ",
                key: { name: "default_actor" },
                changed: ["body"],
                snapshot: { name: "default_actor", body: "text2" }
            });

            expect(rev2.actor).toBe("unknown");
        } finally {
            await db.close();
        }
    });

    test("rejects revisions with empty changed fields", async () => {
        const db = createDb();
        await db.create();
        await db.load();

        try {
            const subject = await db.createSubject("tag", { name: "empty_changed" }, {});

            await expect(
                db.addRevision({
                    target: "tag",
                    subjectId: subject.id,
                    operation: "update",
                    key: { name: "empty_changed" },
                    changed: [],
                    snapshot: { name: "empty_changed", body: "text" }
                })
            ).rejects.toThrow(RevisionError);

            await expect(
                db.addRevision({
                    target: "tag",
                    subjectId: subject.id,
                    operation: "update",
                    key: { name: "empty_changed" },
                    snapshot: { name: "empty_changed", body: "text" }
                })
            ).rejects.toThrow(RevisionError);
        } finally {
            await db.close();
        }
    });

    test("seeds revision migrations on create and safely re-loads", async () => {
        const db = createDb("create_load.sqlite");
        await db.create();
        await db.load();

        const subject = await db.createSubject("tag", { name: "fresh" }, {});

        const rev = await db.addRevision({
            target: "tag",
            subjectId: subject.id,
            operation: "create",
            key: { name: "fresh" },
            changed: ["body"],
            snapshot: { name: "fresh", body: "one" }
        });

        expect(rev.subjectIndex).toBe(1);

        await db.load();

        const fetched = await db.fetchRevisionBySubjectIndex("tag", subject.id, 1);
        expect(fetched).toMatchObject({ id: rev.id, subjectIndex: 1 });

        await db.close();
    });

    test("clears revision range without deleting earlier revisions on the same subject", async () => {
        const db = createDb("range_clear.sqlite");
        await db.create();
        await db.load();

        try {
            const subject = await db.createSubject("tag", { name: "range_tag" }, {});

            for (let i = 1; i <= 5; i++) {
                await db.addRevision({
                    target: "tag",
                    subjectId: subject.id,
                    operation: i === 1 ? "create" : "update",
                    key: { name: "range_tag" },
                    changed: ["body"],
                    snapshot: { name: "range_tag", body: `v${i}` }
                });
            }

            const beforeClear = await db.listRevisions({ target: "tag", subjectId: subject.id, limit: 10 });
            expect(beforeClear).toHaveLength(5);

            await db.clear("tag", {
                subjectId: subject.id,
                fromId: 3,
                toId: 4
            });

            const afterClear = await db.listRevisions({ target: "tag", subjectId: subject.id, limit: 10 });
            const remainingIndices = afterClear.map(r => r.subjectIndex).sort((a, b) => a - b);
            expect(remainingIndices).toEqual([1, 2, 5]);
        } finally {
            await db.close();
        }
    });
});
