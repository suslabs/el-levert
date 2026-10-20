import Revision from "../structures/revision/Revision.js";
import RevisionSubject from "../structures/revision/RevisionSubject.js";

import Util from "./Util.js";
import ObjectUtil from "./ObjectUtil.js";
import ArrayUtil from "./ArrayUtil.js";
import DatabaseUtil from "./database/DatabaseUtil.js";

const RevisionUtil = Object.freeze({
    subject: row => DatabaseUtil.rowEntity(row, RevisionSubject),
    revision: row => DatabaseUtil.rowEntity(row, Revision),

    diff: (before, after) => {
        before = ObjectUtil.guaranteeObject(before);
        after = ObjectUtil.guaranteeObject(after);

        const fields = ArrayUtil.unique(Object.keys(before).concat(Object.keys(after)));

        return Object.fromEntries(
            fields
                .filter(field => !Util.sameValue(before[field], after[field]))
                .map(field => [
                    field,
                    {
                        before: before[field],
                        after: after[field]
                    }
                ])
        );
    },

    changedFields: (before, after) => {
        if (before == null) {
            return Object.keys(after);
        }

        const diff = RevisionUtil.diff(before, after);
        return Object.keys(diff);
    },

    restoreSnapshot: (subject, revision, decodeFunc) => {
        if (revision?.snapshot == null) {
            return null;
        }

        const data = {
            ...subject?.staticSnapshot,
            ...revision.snapshot
        };

        if (typeof decodeFunc !== "function") {
            return data;
        }

        return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, decodeFunc(key, value)]));
    }
});

export default RevisionUtil;
