import Revision from "../../structures/revision/Revision.js";
import RevisionSubject from "../../structures/revision/RevisionSubject.js";

import ObjectUtil from "../../util/ObjectUtil.js";

class RevisionStore {
    constructor(database) {
        this.database = database;
    }

    async createSubject(target, key, staticSnapshot) {
        const res = await this.database.revisionQueries.createSubject.run({
            $target: target,
            $key: this.constructor._json(key),
            $staticSnapshot: this.constructor._json(staticSnapshot),
            $created: Date.now()
        });

        return await this.fetchSubjectById(res.lastID);
    }

    async fetchSubjectById(id) {
        const row = await this.database.revisionQueries.fetchSubjectById.get({
            $id: id
        });

        return this._subject(row);
    }

    async fetchSubject(target, key) {
        const row = await this.database.revisionQueries.fetchSubject.get({
            $target: target,
            $key: this.constructor._json(key)
        });

        return this._subject(row);
    }

    async fetchSubjectByRevisionKey(target, key) {
        const row = await this.database.revisionQueries.fetchSubjectByRevisionKey.get({
            $target: target,
            $key: this.constructor._json(key)
        });

        return this._subject(row);
    }

    async updateSubjectKey(subject, key) {
        const res = await this.database.revisionQueries.updateSubjectKey.run({
            $id: subject.id,
            $key: this.constructor._json(key)
        });

        return res;
    }

    async markSubjectDeleted(subject, deleted = Date.now()) {
        return await this.database.revisionQueries.markSubjectDeleted.run({
            $id: subject.id,
            $deleted: deleted
        });
    }

    async restoreSubject(subject, key) {
        return await this.database.revisionQueries.restoreSubject.run({
            $id: subject.id,
            $key: this.constructor._json(key)
        });
    }

    async addRevision(data) {
        data = ObjectUtil.guaranteeObject(data);

        const res = await this.database.revisionQueries.add.run({
            $target: data.target,
            $subjectId: data.subjectId,
            $operation: data.operation,
            $actor: data.actor ?? null,
            $created: data.created ?? Date.now(),
            $key: this.constructor._json(data.key),
            $changed: this.constructor._json(data.changed ?? []),
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
