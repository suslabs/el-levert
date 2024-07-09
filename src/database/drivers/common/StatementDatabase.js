import DatabaseError from "../../../errors/DatabaseError.js";

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
            const ind = this.statements.indexOf(statement);

            if (!ind) {
                throw new DatabaseError("Statement not found");
            }

            delete this.statements[ind];
            this.statements.splice(ind, 1);
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
                        this.removeStatement(st);
                        throw err;
                    }
                }
            }

            this.statements = [];
        }
    }

    return StatementDatabase;
}
