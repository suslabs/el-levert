import { describe, expect, test } from "vitest";

import RevisionManager from "../../../../src/managers/database/revision/RevisionManager.js";
import RevisionTargetSpec from "../../../../src/structures/revision/RevisionTargetSpec.js";

function createStore() {
    const subjects = [],
        revisions = [];

    return {
        createSubject(target, key, staticSnapshot) {
            const subject = {
                id: subjects.length + 1,
                target,
                key,
                staticSnapshot
            };

            subjects.push(subject);
            return subject;
        },
        fetchSubject(target, key) {
            return (
                subjects.find(
                    subject => subject.target === target && JSON.stringify(subject.key) === JSON.stringify(key)
                ) ?? null
            );
        },
        fetchSubjectByRevisionKey() {
            return null;
        },
        updateSubjectKey(subject, key) {
            subject.key = key;
        },
        markSubjectDeleted(subject) {
            subject.deleted = Date.now();
        },
        restoreSubject(subject, key) {
            subject.key = key;
            subject.deleted = null;
        },
        addRevision(data) {
            const revision = {
                id: revisions.length + 1,
                ...data
            };

            revisions.push(revision);
            return revision;
        }
    };
}

describe("RevisionManager", () => {
    test("records create, update, delete, and computes diffs from specs", async () => {
        const spec = new RevisionTargetSpec({
                target: "thing",
                key: ["name"],
                staticFields: ["created"],
                trackedFields: ["name", "body"]
            }),
            store = createStore(),
            manager = new RevisionManager(spec, store);

        const create = await manager.recordCreate({ name: "alpha", body: "one", created: 1 }, { actor: "u1" });
        expect(create).toMatchObject({
            operation: "create",
            changed: ["name", "body"],
            snapshot: {
                name: "alpha",
                body: "one"
            }
        });

        const update = await manager.recordUpdate(
            { name: "alpha", body: "one", created: 1 },
            { name: "beta", body: "two", created: 1 },
            { actor: "u1" }
        );
        expect(update.changed).toEqual(["name", "body"]);
        expect(update.key).toEqual({ name: "beta" });

        const skipped = await manager.recordUpdate(
            { name: "beta", body: "two", created: 1 },
            { name: "beta", body: "two", created: 1 }
        );
        expect(skipped).toBeNull();

        const remove = await manager.recordDelete({ name: "beta", body: "two", created: 1 });
        expect(remove).toMatchObject({
            operation: "delete",
            snapshot: null
        });

        expect(manager.diff({ body: "one" }, { body: "two" })).toEqual({
            body: {
                before: "one",
                after: "two"
            }
        });
    });
});
