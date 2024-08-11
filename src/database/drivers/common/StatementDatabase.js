import DatabaseError from "../../../errors/DatabaseError.js";

import Util from "../../../util/Util.js";

export default function (base) {
    class StatementDatabase extends base {
        constructor(...args) {
            super(...args);

            this.statements = [];
        }

        addStatement(statement) {
            this.statements.push(statement);
        }

        removeStatement(statement) {
            const removed = Util.removeItem(this.statements, statement);

            if (!removed) {
                throw new DatabaseError("Statement not found");
            }
        }

        async finalizeStatement(statement) {
            this.removeStatement(statement);
            await statement.finalize(false);
        }

        async finalizeAll() {
            for (const st of this.statements) {
                if (st.finalized) {
                    continue;
                }

                try {
                    await st.finalize(false);
                } catch (err) {
                    if (err.name !== "DatabaseError") {
                        throw err;
                    }
                }
            }

            this.statements = [];
        }
    }

    return StatementDatabase;
}
