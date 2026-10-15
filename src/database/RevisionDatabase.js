import SqlDatabase from "./SqlDatabase.js";

import Util from "../util/Util.js";
import ObjectUtil from "../util/ObjectUtil.js";
import ArrayUtil from "../util/ArrayUtil.js";
import RevisionUtil from "../util/RevisionUtil.js";
import FileUtil from "../util/misc/FileUtil.js";

import dbFilenames from "./config/dbFilenames.json" assert { type: "json" };

import RevisionError from "../errors/RevisionError.js";

const revisionQueryPath = FileUtil.resolve(dbFilenames.queryPath, "revision"),
    revisionMigrationsPath = FileUtil.resolve(dbFilenames.migrationsPath, "revision");

const revisionMigrationsTable = "revision_migrations";

class RevisionDatabase extends SqlDatabase {
    constructor(dbPath, queryPath, options) {
        options = ObjectUtil.guaranteeObject(options);

        super(dbPath, queryPath, options);

        this._registerQueryPath(revisionQueryPath);
    }

    async setup(mode) {
        if (mode === "load") {
            await this.db.migrate({
                migrationsPath: revisionMigrationsPath,
                table: revisionMigrationsTable
            });
        } else if (mode === "create") {
            const migrations = await this._loadMigrations(revisionMigrationsPath);
            await this._seedAppliedMigrations(
                migrations.map(m => m.id),
                revisionMigrationsPath,
                revisionMigrationsTable
            );
        }
    }

    async createSubject(target, key, staticSnapshot) {
        const res = await this.subjectQueries.create.run({
            $target: target,
            $key: JSON.stringify(key),
            $staticSnapshot: JSON.stringify(staticSnapshot),
            $created: Date.now()
        });

        return await this.fetchSubjectById(res.lastID);
    }

    async fetchSubjectById(id) {
        const row = await this.subjectQueries.fetchById.get({
            $id: id
        });

        return RevisionUtil.subject(row);
    }

    async fetchSubject(target, key) {
        const row = await this.subjectQueries.fetch.get({
            $target: target,
            $key: JSON.stringify(key)
        });

        return RevisionUtil.subject(row);
    }

    async fetchSubjectByRevisionKey(target, key) {
        const row = await this.subjectQueries.fetchByRevisionKey.get({
            $target: target,
            $key: JSON.stringify(key)
        });

        return RevisionUtil.subject(row);
    }

    async fetchInactiveSubject(target, key) {
        const row = await this.subjectQueries.fetchInactive.get({
            $target: target,
            $key: JSON.stringify(key)
        });

        return RevisionUtil.subject(row);
    }

    async updateSubjectKey(subject, key) {
        const res = await this.subjectQueries.updateKey.run({
            $id: subject.id,
            $key: JSON.stringify(key)
        });

        return res;
    }

    async markSubjectDeleted(subject, deleted = Date.now()) {
        return await this.subjectQueries.markDeleted.run({
            $id: subject.id,
            $deleted: deleted
        });
    }

    async restoreSubject(subject, key) {
        return await this.subjectQueries.restore.run({
            $id: subject.id,
            $key: JSON.stringify(key)
        });
    }

    async addRevision(data) {
        data = ObjectUtil.guaranteeObject(data);

        const rawActor = typeof data.actor === "string" ? data.actor.trim() : "",
            actor = Util.empty(rawActor) ? "unknown" : rawActor;

        const changed = ArrayUtil.guaranteeArray(data.changed, null, true)
            .map(field => (typeof field === "string" ? field.trim() : field))
            .filter(field => Util.nonemptyString(field));

        if (Util.empty(changed)) {
            throw new RevisionError("Revision changed fields cannot be empty");
        }

        const res = await this.revisionQueries.add.run({
            $target: data.target,
            $subjectId: data.subjectId,
            $operation: data.operation,
            $actor: actor,
            $created: data.created ?? Date.now(),
            $key: JSON.stringify(data.key),
            $changed: JSON.stringify(changed),
            $snapshot: data.snapshot == null ? null : JSON.stringify(data.snapshot),
            $revertOf: data.revertOf ?? null,
            $restores: data.restores ?? null,
            $reason: data.reason ?? null
        });

        return await this.fetchRevision(res.lastID);
    }

    async fetchRevision(id) {
        const row = await this.revisionQueries.fetch.get({
            $id: id
        });

        return RevisionUtil.revision(row);
    }

    async fetchRevisionBySubjectIndex(target, subjectId, subjectIndex) {
        const row = await this.revisionQueries.fetchBySubjectIndex.get({
            $target: target,
            $subjectId: subjectId,
            $subjectIndex: subjectIndex
        });

        return RevisionUtil.revision(row);
    }

    async fetchLatest(target, subjectId) {
        const row = await this.revisionQueries.latest.get({
            $target: target,
            $subjectId: subjectId
        });

        return RevisionUtil.revision(row);
    }

    async fetchPrevious(revision) {
        const row = await this.revisionQueries.previous.get({
            $target: revision.target,
            $subjectId: revision.subjectId,
            $created: revision.created,
            $id: revision.id
        });

        return RevisionUtil.revision(row);
    }

    async listRevisions(options) {
        options = ObjectUtil.guaranteeObject(options);

        const rows = await this.revisionQueries.list.all({
            $target: options.target ?? null,
            $subjectId: options.subjectId ?? null,
            $actor: options.actor ?? null,
            $operation: options.operation ?? null,
            $from: options.from ?? null,
            $to: options.to ?? null,
            $limit: options.limit ?? 10,
            $offset: options.offset ?? 0
        });

        return RevisionUtil.revision(rows);
    }

    async clear(target, options) {
        options = ObjectUtil.guaranteeObject(options);

        const res = await this.revisionQueries.clear.run({
            $target: target,
            $subjectId: options.subjectId ?? null,
            $id: options.id ?? null,
            $fromId: options.fromId ?? null,
            $toId: options.toId ?? null,
            $from: options.from ?? null,
            $to: options.to ?? null
        });

        const isFullClear =
            options.subjectId == null &&
            options.id == null &&
            options.fromId == null &&
            options.toId == null &&
            options.from == null &&
            options.to == null;

        if (isFullClear && typeof this.revisionQueries.resetSequence?.run === "function") {
            await this.revisionQueries.resetSequence.run();
        }

        return res;
    }

    async countRevertsOf(revision) {
        const row = await this.revisionQueries.countRevertsOf.get({
            $id: revision.id
        });

        return row.count;
    }
}

export default RevisionDatabase;
