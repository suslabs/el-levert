import { describe, expect, test } from "vitest";

import Revision from "../../../src/structures/revision/Revision.js";
import RevisionSubject from "../../../src/structures/revision/RevisionSubject.js";
import RevisionTargetSpec from "../../../src/structures/revision/RevisionTargetSpec.js";

describe("revision structures", () => {
    test("normalizes revision json fields and preserves getData shape", () => {
        const revision = new Revision({
            id: 1,
            target: "tag",
            subjectId: 2,
            operation: "update",
            key: '{"name":"alpha"}',
            changed: '["body"]',
            snapshot: '{"name":"alpha","body":"new"}'
        });

        expect(revision.key).toEqual({ name: "alpha" });
        expect(revision.changed).toEqual(["body"]);
        expect(revision.snapshot).toEqual({ name: "alpha", body: "new" });
        expect(revision.getData("$")).toMatchObject({
            $id: 1,
            $target: "tag",
            $subjectId: 2
        });
    });

    test("initializes default values including unknown actor", () => {
        const revision = new Revision();

        expect(revision.actor).toBe("unknown");
        expect(revision.changed).toEqual([]);
        expect(revision.key).toEqual({});
        expect(revision.snapshot).toBeNull();
    });

    test("normalizes revision subjects and target specs", () => {
        const subject = new RevisionSubject({
            id: 3,
            target: "tag",
            key: '{"name":"alpha"}',
            staticSnapshot: '{"registered":10}'
        });

        expect(subject.key).toEqual({ name: "alpha" });
        expect(subject.staticSnapshot).toEqual({ registered: 10 });
        expect(subject.deletedState).toBe(false);

        const spec = new RevisionTargetSpec({
            target: "tag",
            key: "name",
            staticFields: ["registered"],
            trackedFields: ["name", "body"],
            encode: (field, value) => (field === "body" ? value.toUpperCase() : value)
        });

        expect(spec.getKey({ name: "alpha" })).toEqual({ name: "alpha" });
        expect(spec.getStaticSnapshot({ registered: 5 })).toEqual({ registered: 5 });
        expect(spec.getSnapshot({ name: "alpha", body: "text" })).toEqual({ name: "alpha", body: "TEXT" });
    });
});
