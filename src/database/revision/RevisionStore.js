import Revision from "../../structures/revision/Revision.js";
import RevisionSubject from "../../structures/revision/RevisionSubject.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import ArrayUtil from "../../util/ArrayUtil.js";

import RevisionError from "../../errors/RevisionError.js";

class RevisionStore {
    constructor(database) {
        this.database = database;
    }

    async createSubject(target, key, staticSnapshot) {
        const res = await this.database.subjectQueries.create.run({
            $target: target,
            $key: this.constructor._json(key),
            $staticSnapshot: this.constructor._json(staticSnapshot),
            $created: Date.now()
        });

        return await this.fetchSubjectById(res.lastID);
    }

    async fetchSubjectById(id) {
        const row = await this.database.subjectQueries.fetchById.get({
            $id: id
        });

        return this._subject(row);
    }

    async fetchSubject(target, key) {
        const row = await this.database.subjectQueries.fetch.get({
            $target: target,
            $key: this.constructor._json(key)
        });

        return this._subject(row);
    }

    async fetchSubjectByRevisionKey(target, key) {
        const row = await this.database.subjectQueries.fetchByRevisionKey.get({
            $target: target,
            $key: this.constructor._json(key)
        });

        return this._subject(row);
    }

    async updateSubjectKey(subject, key) {
        const res = await this.database.subjectQueries.updateKey.run({
            $id: subject.id,
            $key: this.constructor._json(key)
        });

        return res;
    }

    async markSubjectDeleted(subject, deleted = Date.now()) {
        return await this.database.subjectQueries.markDeleted.run({
            $id: subject.id,
            $deleted: deleted
        });
    }

    async restoreSubject(subject, key) {
        return await this.database.subjectQueries.restore.run({
            $id: subject.id,
            $key: this.constructor._json(key)
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

        const res = await this.database.revisionQueries.add.run({
            $target: data.target,
            $subjectId: data.subjectId,
            $operation: data.operation,
            $actor: actor,
            $created: data.created ?? Date.now(),
            $key: this.constructor._json(data.key),
            $changed: this.constructor._json(changed),
            $snapshot: data.snapshot === null ? null : this.constructor._json(data.snapshot),
            $revertOf: data.revertOf ?? null,
            $restores: data.restores ?? null,
            $reason: data.reason ?? null
        });

        return await this.fetchRevision(res.lastID);
    }

    async fetchRevision(id) {
        const row = await this.database.revisionQueries.fetch.get({
            $id: id
        });

        return this._revision(row);
    }

    async fetchLatest(target, subjectId) {
        const row = await this.database.revisionQueries.latest.get({
            $target: target,
            $subjectId: subjectId
        });

        return this._revision(row);
    }

    async fetchPrevious(revision) {
        const row = await this.database.revisionQueries.previous.get({
            $target: revision.target,
            $subjectId: revision.subjectId,
            $created: revision.created,
            $id: revision.id
        });

        return this._revision(row);
    }

    async listRevisions(options) {
        options = ObjectUtil.guaranteeObject(options);

        const rows = await this.database.revisionQueries.list.all({
            $target: options.target ?? null,
            $subjectId: options.subjectId ?? null,
            $actor: options.actor ?? null,
            $operation: options.operation ?? null,
            $from: options.from ?? null,
            $to: options.to ?? null,
            $limit: options.limit ?? 10,
            $offset: options.offset ?? 0
        });

        return Array.from(rows).map(row => new Revision(row));
    }

    async clear(target, options) {
        options = ObjectUtil.guaranteeObject(options);

        return await this.database.revisionQueries.clear.run({
            $target: target,
            $subjectId: options.subjectId ?? null,
            $id: options.id ?? null,
            $fromId: options.fromId ?? null,
            $toId: options.toId ?? null,
            $from: options.from ?? null,
            $to: options.to ?? null
        });
    }

    async countRevertsOf(revision) {
        const row = await this.database.revisionQueries.countRevertsOf.get({
            $id: revision.id
        });

        return row.count;
    }

    static _json(value) {
        return JSON.stringify(value);
    }

    _subject(row) {
        return typeof row._data === "undefined" ? null : new RevisionSubject(row);
    }

    _revision(row) {
        return typeof row._data === "undefined" ? null : new Revision(row);
    }
}

export default RevisionStore;
