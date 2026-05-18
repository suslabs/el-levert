import DatabaseUtil from "../../../util/database/DatabaseUtil.js";

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

    _resetStatements(st, rawSts, resolve1, reject1) {
        const resetPromises = Array.from(rawSts, rawSt => {
            return new Promise((resolve2, reject2) => {
                try {
                    rawSt.reset(err => {
                        if (st._throwErrorAsync(resolve2, reject2, err)) {
                            return;
                        }

                        resolve2();
                    });
                } catch (err) {
                    DatabaseUtil.settleSyncError(st, resolve2, reject2, err);
                }
            });
        });

        Promise.all(resetPromises).then(_ => resolve1()).catch(reject1);
    }
}

class ConnectionStatementBackend extends StatementBackend {
    constructor(conn, rawSt) {
        super();

        this._conn = conn;
        this._rawSt = rawSt;
    }

    finalize(st, resolve, reject, removeEntry) {
        try {
            this._rawSt.finalize(err => {
                this._finalizeStatement(st, resolve, reject, err, removeEntry, () => {
                    this._rawSt = null;
                    this._conn.removeStatement(st);
                });
            });
        } catch (err) {
            DatabaseUtil.settleSyncError(st, resolve, reject, err);
        }
    }

    bind(st, param, resolve, reject) {
        try {
            param = st._normalizeArgs(this._conn, param);
        } catch (err) {
            DatabaseUtil.settleSyncError(st, resolve, reject, err);
            return;
        }

        try {
            this._rawSt.bind(...param, err => {
                if (st._throwErrorAsync(resolve, reject, err)) {
                    return;
                }

                resolve();
            });
        } catch (err) {
            DatabaseUtil.settleSyncError(st, resolve, reject, err);
        }
    }

    reset(st, resolve, reject) {
        this._resetStatements(st, [this._rawSt], resolve, reject);
    }

    getContext(_st) {
        return Promise.resolve({
            conn: this._conn,
            st: this._rawSt,
            pooled: false
        });
    }

    releaseContext(_context) {
        return Promise.resolve();
    }

    safeIntegers(_st, enabled) {
        this._rawSt.safeIntegers(enabled);
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
        this._rawSts = new Map();
    }

    finalize(st, resolve1, reject1, removeEntry) {
        const finalizePromises = Array.from(this._rawSts.entries(), ([conn, rawSt]) => {
            return new Promise((resolve2, reject2) => {
                try {
                    rawSt.finalize(err => {
                        if (st._throwErrorAsync(resolve2, reject2, err)) {
                            return;
                        }

                        this._rawSts.delete(conn);
                        resolve2();
                    });
                } catch (err) {
                    DatabaseUtil.settleSyncError(st, resolve2, reject2, err);
                }
            });
        });

        Promise.all(finalizePromises)
            .then(_ => {
                this._finalizeStatement(st, resolve1, reject1, null, removeEntry, () => {});
            })
            .catch(reject1);
    }

    bind(_st, _param, resolve, _reject) {
        resolve();
    }

    safeIntegers(_st, enabled) {
        for (const rawSt of this._rawSts.values()) {
            rawSt.safeIntegers(enabled);
        }
    }

    reset(st, resolve, reject) {
        this._resetStatements(st, this._rawSts.values(), resolve, reject);
    }

    getContext(st) {
        return this._db._getActiveConnection().then(({ conn, pooled }) => {
            return this._getRawSt(st, conn).then(rawSt => {
                if (rawSt == null) {
                    if (pooled) {
                        return this._db._releaseConnection(conn).then(_ => null);
                    }

                    return null;
                }

                return {
                    conn,
                    st: rawSt,
                    pooled
                };
            });
        });
    }

    releaseContext(context) {
        if (context != null && context.pooled) {
            return this._db._releaseConnection(context.conn);
        }

        return Promise.resolve();
    }

    _getRawSt(st, conn) {
        return new Promise((resolve, reject) => {
            if (this._rawSts.has(conn)) {
                resolve(this._rawSts.get(conn));
                return;
            }

            let rawSt = null;

            try {
                rawSt = conn.db.prepare(st.sql, err => {
                    if (conn._throwErrorAsync(resolve, reject, err, null)) {
                        return;
                    }

                    if (st._safeIntegers != null) {
                        rawSt.safeIntegers(st._safeIntegers);
                    }

                    this._rawSts.set(conn, rawSt);
                    resolve(rawSt);
                });
            } catch (err) {
                DatabaseUtil.settleSyncError(st, resolve, reject, err, null);
            }
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
