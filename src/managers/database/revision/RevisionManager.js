import { RevisionOperationTypes } from "../../../structures/revision/RevisionOperationTypes.js";

import Util from "../../../util/Util.js";
import ArrayUtil from "../../../util/ArrayUtil.js";
import ObjectUtil from "../../../util/ObjectUtil.js";

class RevisionManager {
    constructor(spec, store) {
        this.spec = spec;
        this.store = store;
    }

    getKey(data) {
        return this.spec.getKey(data);
    }

    getStaticSnapshot(data) {
        return this.spec.getStaticSnapshot(data);
    }

    getSnapshot(data) {
        return this.spec.getSnapshot(data);
    }

    restoreSnapshot(subject, revision) {
        if (revision.snapshot === null) {
            return null;
        }

        const data = {
            ...subject.staticSnapshot,
            ...revision.snapshot
        };

        return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, this.spec.decodeValue(key, value)]));
    }

    diff(before, after) {
        before = ObjectUtil.guaranteeObject(before);
        after = ObjectUtil.guaranteeObject(after);

        const fields = ArrayUtil.unique(Object.keys(before).concat(Object.keys(after)));

        return Object.fromEntries(
            fields
                .filter(field => !this._sameValue(before[field], after[field]))
                .map(field => [
                    field,
                    {
                        before: before[field],
                        after: after[field]
                    }
                ])
        );
    }

    async ensureSubject(data) {
        const key = this.getKey(data);

        let subject = await this.store.fetchSubject(this.spec.target, key);

        if (subject === null) {
            subject = await this.store.createSubject(this.spec.target, key, this.getStaticSnapshot(data));
        }

        return subject;
    }

    async findSubject(key) {
        return (
            (await this.store.fetchSubject(this.spec.target, key)) ??
            (await this.store.fetchSubjectByRevisionKey(this.spec.target, key))
        );
    }

    async recordCreate(data, options) {
        options = ObjectUtil.guaranteeObject(options);

        const subject = await this.ensureSubject(data),
            snapshot = this.getSnapshot(data),
            changed = this._changedFields(null, snapshot);

        await this.store.restoreSubject(subject, this.getKey(data));

        return await this._addRevision(subject, RevisionOperationTypes.create, snapshot, changed, options);
    }

    async recordUpdate(before, after, options) {
        options = ObjectUtil.guaranteeObject(options);

        const subject = await this.ensureSubject(before),
            oldSnapshot = this.getSnapshot(before),
            snapshot = this.getSnapshot(after),
            changed = this._changedFields(oldSnapshot, snapshot);

        if (Util.empty(changed)) {
            return null;
        }

        const oldKey = this.getKey(before),
            key = this.getKey(after);

        if (!this._sameValue(oldKey, key)) {
            await this.store.updateSubjectKey(subject, key);
        }

        return await this._addRevision(subject, RevisionOperationTypes.update, snapshot, changed, options);
    }

    async recordDelete(data, options) {
        options = ObjectUtil.guaranteeObject(options);

        const subject = await this.ensureSubject(data),
            snapshot = this.getSnapshot(data),
            changed = Object.keys(snapshot);

        await this.store.markSubjectDeleted(subject);

        return await this._addRevision(subject, RevisionOperationTypes.delete, null, changed, options);
    }

    async recordRevert(subject, snapshot, changed, options) {
        options = ObjectUtil.guaranteeObject(options);

        if (snapshot === null) {
            await this.store.markSubjectDeleted(subject);
        } else {
            await this.store.restoreSubject(subject, this._snapshotKey(snapshot));
        }

        return await this._addRevision(subject, RevisionOperationTypes.revert, snapshot, changed, options);
    }

    _snapshotKey(snapshot) {
        return this.spec.getKey(snapshot);
    }

    _changedFields(before, after) {
        if (before === null) {
            return Object.keys(after);
        }

        const diff = this.diff(before, after);
        return Object.keys(diff);
    }

    _sameValue(a, b) {
        return JSON.stringify(a) === JSON.stringify(b);
    }

    async _addRevision(subject, operation, snapshot, changed, options) {
        return await this.store.addRevision({
            target: this.spec.target,
            subjectId: subject.id,
            operation,
            actor: options.actor,
            key: snapshot === null ? subject.key : this._snapshotKey(snapshot),
            changed,
            snapshot,
            revertOf: options.revertOf,
            restores: options.restores,
            reason: options.reason
        });
    }
}

export default RevisionManager;
