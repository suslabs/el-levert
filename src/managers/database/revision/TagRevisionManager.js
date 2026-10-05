import { Buffer } from "node:buffer";

import RevisionManager from "./RevisionManager.js";

import RevisionTargetSpec from "../../../structures/revision/RevisionTargetSpec.js";
import { RevisionOperationTypes } from "../../../structures/revision/RevisionOperationTypes.js";
import Tag from "../../../structures/tag/Tag.js";

import { getConfig } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import ObjectUtil from "../../../util/ObjectUtil.js";

import TagError from "../../../errors/TagError.js";

class TagRevisionManager {
    static target = "tag";

    static revertAgeLimit = Util.durationSeconds.hour * 1000;

    constructor(tagManager) {
        this.tagManager = tagManager;
        this.spec = new RevisionTargetSpec({
            target: this.constructor.target,
            key: ["name"],
            staticFields: ["registered"],
            trackedFields: ["aliasName", "name", "body", "bin", "owner", "args", "type"],
            liveFields: ["lastEdited"],
            encode: this.constructor.encodeValue,
            decode: this.constructor.decodeValue,
            label: key => key.name
        });
    }

    get enabled() {
        return getConfig()?.enableAuditLog ?? true;
    }

    static encodeValue(field, value) {
        switch (field) {
            case "type":
                if (typeof value?.toHex === "function") {
                    return value.toHex();
                } else if (ArrayBuffer.isView(value)) {
                    return Buffer.from(value).toString("hex");
                }

                return value;
            case "bin":
                if (ArrayBuffer.isView(value)) {
                    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("base64");
                }

                return value;
            default:
                return value;
        }
    }

    static decodeValue(field, value) {
        switch (field) {
            case "type":
                return Buffer.from(value ?? "00", "hex");
            case "bin":
                return value == null ? null : Buffer.from(value, "base64");
            default:
                return value ?? Tag.defaultValues[field] ?? value;
        }
    }

    getKey(name) {
        return {
            name
        };
    }

    async recordCreate(tag, tx, options) {
        return await this._manager(tx).recordCreate(this._data(tag), options);
    }

    async recordUpdate(before, after, tx, options) {
        return await this._manager(tx).recordUpdate(this._data(before), this._data(after), options);
    }

    async recordDelete(tag, tx, options) {
        return await this._manager(tx).recordDelete(this._data(tag), options);
    }

    async recordRevert(subject, tag, changed, tx, options) {
        const snapshot = tag === null ? null : this._manager(tx).getSnapshot(this._data(tag));
        return await this._manager(tx).recordRevert(subject, snapshot, changed, options);
    }

    async findSubject(name, tx = this.tagManager.tag_db) {
        return await this._manager(tx).findSubject(this.getKey(name));
    }

    async fetchRevision(id, tx = this.tagManager.tag_db) {
        return await tx.getRevisionStore().fetchRevision(id);
    }

    async fetchRevisionByIndex(subject, subjectIndex, tx = this.tagManager.tag_db) {
        return await tx.getRevisionStore().fetchRevisionBySubjectIndex(this.spec.target, subject.id, subjectIndex);
    }

    async fetchLatest(subject, tx = this.tagManager.tag_db) {
        return await tx.getRevisionStore().fetchLatest(this.spec.target, subject.id);
    }

    async fetchPrevious(revision, tx = this.tagManager.tag_db) {
        return await tx.getRevisionStore().fetchPrevious(revision);
    }

    async countRevertsOf(revision, tx = this.tagManager.tag_db) {
        return await tx.getRevisionStore().countRevertsOf(revision);
    }

    async list(options = {}, tx = this.tagManager.tag_db) {
        options = ObjectUtil.guaranteeObject(options);

        let subjectId = options.subjectId;

        if (Util.nonemptyString(options.name)) {
            const subject = await this.findSubject(options.name, tx);
            subjectId = subject?.id ?? -1;
        }

        return await tx.getRevisionStore().listRevisions({
            target: this.spec.target,
            ...options,
            subjectId
        });
    }

    async clear(options, tx = this.tagManager.tag_db) {
        options = ObjectUtil.guaranteeObject(options);

        if (Util.nonemptyString(options.subject)) {
            const subject = await this.findSubject(options.subject, tx);
            options = {
                ...options,
                subjectId: subject?.id ?? -1
            };
        }

        return await this._manager(tx).clear(options);
    }

    async getDetail(id, tagName, tx = this.tagManager.tag_db) {
        let revision = null,
            subject = null;

        if (Util.nonemptyString(tagName)) {
            subject = await this.findSubject(tagName, tx);

            if (subject !== null) {
                revision = await this.fetchRevisionByIndex(subject, id, tx);
            }
        }

        if (revision === null) {
            revision = await this.fetchRevision(id, tx);
        }

        if (revision === null || revision.target !== this.spec.target) {
            throw new TagError("Revision doesn't exist", id);
        }

        if (subject === null) {
            subject = await tx.getRevisionStore().fetchSubjectById(revision.subjectId);
        }

        const previous = await this.fetchPrevious(revision, tx),
            manager = this._manager(tx),
            before = previous === null ? null : manager.restoreSnapshot(subject, previous),
            after = revision.snapshot === null ? null : manager.restoreSnapshot(subject, revision),
            diff = manager.diff(before, after);

        return {
            subject,
            revision,
            previous,
            before,
            after,
            diff
        };
    }

    makeTag(subject, revision) {
        const data = this._manager(this.tagManager.tag_db).restoreSnapshot(subject, revision);
        return data === null ? null : new Tag(data);
    }

    validateUserRevert(actor, subject, latest, previous, restoredTag) {
        if (!Util.nonemptyString(actor)) {
            throw new TagError("Only moderators can revert this revision");
        } else if (previous === null && latest.operation !== RevisionOperationTypes.create) {
            throw new TagError("No previous tag state exists");
        }

        const snapshot = restoredTag ?? this.makeTag(subject, latest);

        if (latest.operation === RevisionOperationTypes.revert) {
            throw new TagError("This tag edit has already been reverted");
        } else if (snapshot?.owner !== actor) {
            throw new TagError("You can only revert your own tags");
        } else if (latest.actor !== actor) {
            throw new TagError("You can only revert your own actions");
        } else if (Date.now() - latest.created > this.constructor.revertAgeLimit) {
            throw new TagError("This tag edit is too old to revert");
        }
    }

    _data(tag) {
        tag = Tag.from(tag);
        return tag.getData();
    }

    _manager(tx) {
        return new RevisionManager(this.spec, tx.getRevisionStore());
    }
}

export default TagRevisionManager;
