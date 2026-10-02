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

describe("RevisionStore", () => {
    test("persists subjects and revisions through query-backed storage", async () => {
        const db = createDb();
        await db.create();
        await db.load();

        const store = db.getRevisionStore(),
            subject = await store.createSubject("tag", { name: "alpha" }, { registered: 1 });

        expect(subject).toMatchObject({
            target: "tag",
            key: { name: "alpha" },
            staticSnapshot: { registered: 1 }
        });

        const revision = await store.addRevision({
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

        await store.updateSubjectKey(subject, { name: "beta" });
        expect(await store.fetchSubject("tag", { name: "beta" })).toMatchObject({ id: subject.id });
        expect(await store.fetchSubjectByRevisionKey("tag", { name: "alpha" })).toMatchObject({ id: subject.id });

        await store.markSubjectDeleted(subject, 20);
        expect(await store.fetchSubject("tag", { name: "beta" })).toBeNull();

        await store.restoreSubject(subject, { name: "beta" });
        expect(await store.fetchLatest("tag", subject.id)).toMatchObject({ id: revision.id });
        expect(await store.listRevisions({ target: "tag", actor: "u1", limit: 5 })).toHaveLength(1);

        await db.close();
    });

    test("defaults actor to unknown when omitted or whitespace", async () => {
        const db = createDb();
        await db.create();
        await db.load();

        try {
            const store = db.getRevisionStore(),
                subject = await store.createSubject("tag", { name: "default_actor" }, {});

            const rev1 = await store.addRevision({
                target: "tag",
                subjectId: subject.id,
                operation: "create",
                key: { name: "default_actor" },
                changed: ["body"],
                snapshot: { name: "default_actor", body: "text" }
            });

            expect(rev1.actor).toBe("unknown");

            const rev2 = await store.addRevision({
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
            const store = db.getRevisionStore(),
                subject = await store.createSubject("tag", { name: "empty_changed" }, {});

            await expect(
                store.addRevision({
                    target: "tag",
                    subjectId: subject.id,
                    operation: "update",
                    key: { name: "empty_changed" },
                    changed: [],
                    snapshot: { name: "empty_changed", body: "text" }
                })
            ).rejects.toThrow(RevisionError);

            await expect(
                store.addRevision({
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
});
