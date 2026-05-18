import ArrayUtil from "../../../util/ArrayUtil.js";

import DatabaseError from "../../../errors/DatabaseError.js";

export default function (base) {
    class StatementDatabase extends base {
        constructor(...args) {
            super(...args);

            this.statements = [];
        }

        addStatement(st) {
            this.statements.push(st);
        }

        removeStatement(st) {
            const [removed] = ArrayUtil.removeItem(this.statements, st);

            if (this.throwErrors && !removed) {
                throw new DatabaseError("Statement not found");
            }

            return removed;
        }

        async finalizeStatement(st) {
            this.removeStatement(st);
            await st.finalize(false);
        }

        async finalizeAll() {
            return await ArrayUtil.wipeArray(this.statements, async st => {
                if (st.finalized) {
                    return;
                }

                try {
                    await st.finalize(false);
                } catch (err) {
                    if (err.name !== "DatabaseError") {
                        throw err;
                    }
                }
            });
        }
    }

    return StatementDatabase;
}
