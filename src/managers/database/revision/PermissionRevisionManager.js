import RevisionManager from "./RevisionManager.js";
import PermissionRevisionTargets from "./PermissionRevisionTargets.js";

import RevisionTargetSpec from "../../../structures/revision/RevisionTargetSpec.js";
import Group from "../../../structures/permission/Group.js";
import User from "../../../structures/permission/User.js";

import { getConfig } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import ObjectUtil from "../../../util/ObjectUtil.js";

import PermissionError from "../../../errors/PermissionError.js";

class PermissionRevisionManager {
    static groupTarget = PermissionRevisionTargets.group;
    static userTarget = PermissionRevisionTargets.user;

    constructor(permissionManager) {
        this.permissionManager = permissionManager;
        this.groupSpec = new RevisionTargetSpec({
            target: this.constructor.groupTarget,
            key: ["name"],
            trackedFields: ["name", "level"],
            label: key => key.name
        });
        this.userSpec = new RevisionTargetSpec({
            target: this.constructor.userTarget,
            key: ["user", "group"],
            trackedFields: ["user", "group"],
            label: key => `${key.user} in ${key.group}`
        });
        this.specs = new Map([
            [this.constructor.groupTarget, this.groupSpec],
            [this.constructor.userTarget, this.userSpec]
        ]);
    }

    get enabled() {
        return getConfig()?.enableAuditLog ?? true;
    }

    async recordGroupCreate(group, tx, options) {
        return await this._manager(this.groupSpec, tx).recordCreate(this._groupData(group), options);
    }

    async recordGroupUpdate(before, after, tx, options) {
        return await this._manager(this.groupSpec, tx).recordUpdate(
            this._groupData(before),
            this._groupData(after),
            options
        );
    }

    async recordGroupDelete(group, tx, options) {
        return await this._manager(this.groupSpec, tx).recordDelete(this._groupData(group), options);
    }

    async recordUserCreate(group, user, tx, options) {
        return await this._manager(this.userSpec, tx).recordCreate(this._userData(group, user), options);
    }

    async recordUserUpdate(before, after, tx, options) {
        return await this._manager(this.userSpec, tx).recordUpdate(
            this._userData(before.group, before),
            this._userData(after.group, after),
            options
        );
    }

    async recordUserDelete(group, user, tx, options) {
        return await this._manager(this.userSpec, tx).recordDelete(this._userData(group, user), options);
    }

    async recordRevert(target, subject, data, changed, tx, options) {
        const spec = this._getSpec(target),
            manager = this._manager(spec, tx),
            snapshot = data === null ? null : manager.getSnapshot(data);

        return await manager.recordRevert(subject, snapshot, changed, options);
    }

    async findGroupSubject(name, tx = this.permissionManager.perm_db) {
        return await this._manager(this.groupSpec, tx).findSubject({ name });
    }

    async findUserSubject(user, group, tx = this.permissionManager.perm_db) {
        return await this._manager(this.userSpec, tx).findSubject({ user, group });
    }

    async fetchRevision(id, tx = this.permissionManager.perm_db) {
        return await tx.getRevisionStore().fetchRevision(id);
    }

    async fetchLatest(subject, tx = this.permissionManager.perm_db) {
        return await tx.getRevisionStore().fetchLatest(subject.target, subject.id);
    }

    async fetchPrevious(revision, tx = this.permissionManager.perm_db) {
        return await tx.getRevisionStore().fetchPrevious(revision);
    }

    async countRevertsOf(revision, tx = this.permissionManager.perm_db) {
        return await tx.getRevisionStore().countRevertsOf(revision);
    }

    async list(options = {}, tx = this.permissionManager.perm_db) {
        options = ObjectUtil.guaranteeObject(options);

        let subjectId = options.subjectId;

        if (Util.nonemptyString(options.subject)) {
            const parts = options.subject.split("/"),
                subject =
                    parts.length === 2
                        ? await this.findUserSubject(parts[0], parts[1], tx)
                        : await this.findGroupSubject(options.subject, tx);

            subjectId = subject?.id ?? -1;
        }

        return await tx.getRevisionStore().listRevisions({
            ...options,
            subjectId
        });
    }

    async clear(options, tx = this.permissionManager.perm_db) {
        options = ObjectUtil.guaranteeObject(options);

        if (Util.nonemptyString(options.subject)) {
            const parts = options.subject.split("/"),
                subject =
                    parts.length === 2
                        ? await this.findUserSubject(parts[0], parts[1], tx)
                        : await this.findGroupSubject(options.subject, tx),
                target = parts.length === 2 ? this.constructor.userTarget : this.constructor.groupTarget;

            options = {
                ...options,
                subjectId: subject?.id ?? -1
            };

            const manager = this._manager(this.specs.get(target), tx);
            return (await manager.clear(options)).changes;
        }

        const groupResult = await this._manager(this.groupSpec, tx).clear(options),
            userResult = await this._manager(this.userSpec, tx).clear(options);

        return groupResult.changes + userResult.changes;
    }

    async getDetail(id, tx = this.permissionManager.perm_db) {
        const revision = await this.fetchRevision(id, tx),
            spec = revision === null ? null : this.specs.get(revision.target);

        if (revision === null || typeof spec === "undefined") {
            throw new PermissionError("Revision doesn't exist", id);
        }

        const subject = await tx.getRevisionStore().fetchSubjectById(revision.subjectId),
            previous = await this.fetchPrevious(revision, tx),
            manager = this._manager(spec, tx),
            before = previous === null ? null : manager.restoreSnapshot(subject, previous),
            after = revision.snapshot === null ? null : manager.restoreSnapshot(subject, revision);

        return {
            subject,
            revision,
            previous,
            before,
            after,
            diff: manager.diff(before, after),
            label: spec.getLabel(revision.key)
        };
    }

    makeGroup(subject, revision, tx = this.permissionManager.perm_db) {
        const data = this._manager(this.groupSpec, tx).restoreSnapshot(subject, revision);
        return data === null ? null : new Group(data);
    }

    makeUser(subject, revision, tx = this.permissionManager.perm_db) {
        const data = this._manager(this.userSpec, tx).restoreSnapshot(subject, revision);
        return data === null ? null : new User(data);
    }

    getDiff(target, before, after, tx = this.permissionManager.perm_db) {
        const manager = this._manager(this._getSpec(target), tx),
            beforeSnapshot = before === null ? null : manager.getSnapshot(before),
            afterSnapshot = after === null ? null : manager.getSnapshot(after);

        return manager.diff(beforeSnapshot, afterSnapshot);
    }

    _getSpec(target) {
        const spec = this.specs.get(target);

        if (typeof spec === "undefined") {
            throw new PermissionError("Unknown revision target", target);
        }

        return spec;
    }

    _groupData(group) {
        group = Group.from(group);
        return group.getData();
    }

    _userData(group, user) {
        user = User.from(user);

        return {
            user: user.user,
            group: typeof group === "string" ? group : Group.from(group).name
        };
    }

    _manager(spec, tx) {
        return new RevisionManager(spec, tx.getRevisionStore());
    }
}

export default PermissionRevisionManager;
