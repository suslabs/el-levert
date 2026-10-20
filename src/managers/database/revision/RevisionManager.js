import { RevisionOperationTypes } from "../../../structures/revision/RevisionOperationTypes.js";

import { getConfig } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import ObjectUtil from "../../../util/ObjectUtil.js";
import RevisionUtil from "../../../util/RevisionUtil.js";

class RevisionManager {
    constructor(spec, db) {
        this.spec = spec;
        this.db = db;
    }

    get enabled() {
        return getConfig()?.enableAuditLog ?? true;
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
        return RevisionUtil.restoreSnapshot(subject, revision, (key, value) => this.spec.decodeValue(key, value));
    }

    diff(before, after) {
        return RevisionUtil.diff(before, after);
    }

    async ensureSubject(data) {
        const key = this.getKey(data);

        let subject =
            (await this.db.fetchSubject(this.spec.target, key)) ??
            (await this.db.fetchInactiveSubject(this.spec.target, key));

        if (subject === null) {
            subject = await this.db.createSubject(this.spec.target, key, this.getStaticSnapshot(data));
        }

        return subject;
    }

    async findSubject(key) {
        return (
            (await this.db.fetchSubject(this.spec.target, key)) ??
            (await this.db.fetchInactiveSubject(this.spec.target, key)) ??
            (await this.db.fetchSubjectByRevisionKey(this.spec.target, key))
        );
    }

    async recordCreate(data, options) {
        if (!this.enabled) {
            return null;
        }

        options = ObjectUtil.guaranteeObject(options);

        const subject = await this.ensureSubject(data),
            snapshot = this.getSnapshot(data),
            changed = this._changedFields(null, snapshot);

        await this.db.restoreSubject(subject, this.getKey(data));

        return await this._addRevision(subject, RevisionOperationTypes.create, snapshot, changed, options);
    }

    async recordUpdate(before, after, options) {
        if (!this.enabled) {
            return null;
        }

        options = ObjectUtil.guaranteeObject(options);

        const subject = await this.ensureSubject(before);
        await this._ensureBaseline(subject, before, options);

        const oldSnapshot = this.getSnapshot(before),
            snapshot = this.getSnapshot(after),
            changed = this._changedFields(oldSnapshot, snapshot);

        if (Util.empty(changed)) {
            return null;
        }

        const oldKey = this.getKey(before),
            key = this.getKey(after);

        if (!Util.sameValue(oldKey, key)) {
            await this.db.updateSubjectKey(subject, key);
        }

        return await this._addRevision(subject, RevisionOperationTypes.update, snapshot, changed, options);
    }

    async recordDelete(data, options) {
        if (!this.enabled) {
            return null;
        }

        options = ObjectUtil.guaranteeObject(options);

        const subject = await this.ensureSubject(data);
        await this._ensureBaseline(subject, data, options);

        const snapshot = this.getSnapshot(data),
            changed = Object.keys(snapshot);

        await this.db.markSubjectDeleted(subject);

        return await this._addRevision(subject, RevisionOperationTypes.delete, null, changed, options);
    }

    async recordRevert(subject, snapshot, changed, options) {
        if (!this.enabled) {
            return null;
        }

        options = ObjectUtil.guaranteeObject(options);

        if (snapshot === null) {
            await this.db.markSubjectDeleted(subject);
        } else {
            await this.db.restoreSubject(subject, this._snapshotKey(snapshot));
        }

        return await this._addRevision(subject, RevisionOperationTypes.revert, snapshot, changed, options);
    }

    async clear(options) {
        options = ObjectUtil.guaranteeObject(options);
        return await this.db.clear(this.spec.target, options);
    }

    _snapshotKey(snapshot) {
        return this.spec.getKey(snapshot);
    }

    _changedFields(before, after) {
        return RevisionUtil.changedFields(before, after);
    }

    async _ensureBaseline(subject, data, options) {
        const latest = await this.db.fetchLatest(this.spec.target, subject.id);

        if (latest === null) {
            const snapshot = this.getSnapshot(data),
                changed = Object.keys(snapshot);

            await this._addRevision(subject, RevisionOperationTypes.import, snapshot, changed, options);
        }
    }

    async _addRevision(subject, operation, snapshot, changed, options) {
        return await this.db.addRevision({
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
