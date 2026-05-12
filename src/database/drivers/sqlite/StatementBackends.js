class StatementBackend {
    _finalizeStatement(st, resolve, reject, err, removeEntry, cleanup) {
        st.finalized = true;
        cleanup();

        if (st._throwErrorAsync(resolve, reject, err)) {
            return;
        }

        st._removeOwner(removeEntry);
        resolve();
    }

    _resetStatements(rawStatements, resolve) {
        const resetPromises = Array.from(rawStatements, rawStatement => {
            return new Promise(resolve1 => {
                rawStatement.reset(_ => {
                    resolve1();
                });
            });
        });

        Promise.all(resetPromises).then(_ => {
            resolve();
        });
    }
}

class ConnectionStatementBackend extends StatementBackend {
    constructor(conn, rawStatement) {
        super();

        this._conn = conn;
        this._rawStatement = rawStatement;
    }

    finalize(st, resolve, reject, removeEntry) {
        this._rawStatement.finalize(err1 => {
            this._finalizeStatement(st, resolve, reject, err1, removeEntry, () => {
                this._rawStatement = null;
                this._conn.removeStatement(st);
            });
        });
    }

    bind(st, param, resolve, reject) {
        try {
            param = st._normalizeArgs(this._conn, param);
        } catch (err1) {
            st._throwErrorAsync(resolve, reject, err1);
            return;
        }

        this._rawStatement.bind(...param, err1 => {
            if (st._throwErrorAsync(resolve, reject, err1)) {
                return;
            }

            resolve();
        });
    }

    reset(_statement, resolve, _reject) {
        this._resetStatements([this._rawStatement], resolve);
    }

    getContext(_statement) {
        return Promise.resolve({
            conn: this._conn,
            st: this._rawStatement,
            pooled: false
        });
    }

    releaseContext(_context) {
        return Promise.resolve();
    }

    getTarget() {
        return this._conn;
    }

    getConnection() {
        return this._conn;
    }
}

class PooledStatementBackend extends StatementBackend {
    constructor(db) {
        super();

        this._db = db;
        this._rawStatements = new Map();
    }

    finalize(st, resolve, reject, removeEntry) {
        const finalizePromises = Array.from(this._rawStatements.entries(), ([conn, rawStatement]) => {
            return new Promise((resolve1, reject1) => {
                rawStatement.finalize(err1 => {
                    if (st._throwErrorAsync(resolve1, reject1, err1)) {
                        return;
                    }

                    this._rawStatements.delete(conn);
                    resolve1();
                });
            });
        });

        Promise.all(finalizePromises)
            .then(_ => {
                this._finalizeStatement(st, resolve, reject, null, removeEntry, () => {});
            })
            .catch(reject);
    }

    bind(_statement, _param, resolve, _reject) {
        resolve();
    }

    reset(_statement, resolve, _reject) {
        this._resetStatements(this._rawStatements.values(), resolve);
    }

    getContext(st) {
        return this._db._getActiveConnection().then(({ conn, pooled }) => {
            return this._getRawStatement(st, conn).then(rawStatement => ({
                conn,
                st: rawStatement,
                pooled
            }));
        });
    }

    releaseContext(context) {
        if (context != null && context.pooled) {
            return this._db._releaseConnection(context.conn);
        }

        return Promise.resolve();
    }

    _getRawStatement(st, conn) {
        return new Promise((resolve, reject) => {
            if (this._rawStatements.has(conn)) {
                resolve(this._rawStatements.get(conn));
                return;
            }

            let rawStatement = null;

            rawStatement = conn.db.prepare(st.sql, err1 => {
                if (conn._throwErrorAsync(resolve, reject, err1)) {
                    return;
                }

                this._rawStatements.set(conn, rawStatement);
                resolve(rawStatement);
            });
        });
    }

    getTarget() {
        return this._db;
    }

    getConnection() {
        return null;
    }
}

export { ConnectionStatementBackend, PooledStatementBackend };
