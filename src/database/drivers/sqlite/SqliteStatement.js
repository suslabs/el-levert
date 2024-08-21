import DatabaseError from "../../../errors/DatabaseError.js";
import DatabaseEvents from "./DatabaseEvents.js";

import SqliteResult from "./SqliteResult.js";

class SqliteStatement {
    constructor(db, st) {
        this.db = db;
        this.st = st;

        this.finalized = false;
    }

    finalize(removeEntry = true) {
        return new Promise((resolve, reject) => {
            if (this.finalized) {
                const err = new DatabaseError("Cannot finalize statement. The statement is already finalized");
                this.db.emit(DatabaseEvents.promiseError, err);

                if (this.db.throwErrors) {
                    reject(err);
                } else {
                    resolve();
                }

                return;
            }

            this.st.finalize(err => {
                this.finalized = true;

                if (removeEntry) {
                    this.db.removeStatement(this);
                }

                if (err) {
                    err = new DatabaseError(err);
                    this.db.emit(DatabaseEvents.promiseError, err);

                    if (this.db.throwErrors) {
                        reject(err);
                        return;
                    } else {
                        resolve();
                        return;
                    }
                }

                resolve();
            });
        });
    }

    bind(...param) {
        return new Promise((resolve, reject) => {
            if (this.finalized) {
                const err = new DatabaseError("The statement is finalized");
                this.db.emit(DatabaseEvents.promiseError, err);

                if (this.db.throwErrors) {
                    reject(err);
                } else {
                    resolve();
                }

                return;
            }

            this.st.bind(...param, err => {
                if (err) {
                    err = new DatabaseError(err);
                    this.db.emit(DatabaseEvents.promiseError, err);

                    if (this.db.throwErrors) {
                        reject(err);
                    } else {
                        resolve();
                    }

                    return;
                }

                resolve();
            });
        });
    }

    reset() {
        return new Promise((resolve, reject) => {
            if (this.finalized) {
                const err = new DatabaseError("The statement is finalized");
                this.db.emit(DatabaseEvents.promiseError, err);

                if (this.db.throwErrors) {
                    reject(err);
                } else {
                    resolve();
                }

                return;
            }

            this.st.reset(_ => {
                resolve();
            });
        });
    }

    run(...param) {
        return new Promise((resolve, reject) => {
            if (this.finalized) {
                const err = new DatabaseError("The statement is finalized");
                this.db.emit(DatabaseEvents.promiseError, err);

                if (this.db.throwErrors) {
                    reject(err);
                } else {
                    resolve();
                }

                return;
            }

            this.st.run(...param, err => {
                if (err) {
                    err = new DatabaseError(err);
                    this.db.emit(DatabaseEvents.promiseError, err);

                    if (this.db.autoRollback && this.db.inTransaction) {
                        this.db
                            .rollback()
                            .then(_ => {
                                if (this.db.throwErrors) {
                                    reject(err);
                                } else {
                                    resolve();
                                }
                            })
                            .catch(reject);
                    } else if (this.db.throwErrors) {
                        reject(err);
                    } else {
                        resolve();
                    }

                    return;
                }

                resolve(new SqliteResult(undefined, this.st));
            });
        });
    }

    get(...param) {
        return new Promise((resolve, reject) => {
            if (this.finalized) {
                const err = new DatabaseError("The statement is finalized");
                this.db.emit(DatabaseEvents.promiseError, err);

                if (this.db.throwErrors) {
                    reject(err);
                } else {
                    resolve();
                }

                return;
            }

            this.st.get(...param, (err, row) => {
                if (err) {
                    err = new DatabaseError(err);
                    this.db.emit(DatabaseEvents.promiseError, err);

                    if (this.db.autoRollback && this.db.inTransaction) {
                        this.db
                            .rollback()
                            .then(_ => {
                                if (this.db.throwErrors) {
                                    reject(err);
                                } else {
                                    resolve();
                                }
                            })
                            .catch(reject);
                    } else if (this.db.throwErrors) {
                        reject(err);
                    } else {
                        resolve();
                    }

                    return;
                }

                resolve(new SqliteResult(row, this.st));
            });
        });
    }

    all(...param) {
        return new Promise((resolve, reject) => {
            if (this.finalized) {
                const err = new DatabaseError("The statement is finalized");
                this.db.emit(DatabaseEvents.promiseError, err);

                if (this.db.throwErrors) {
                    reject(err);
                } else {
                    resolve();
                }

                return;
            }

            this.st.all(...param, (err, rows) => {
                if (err) {
                    err = new DatabaseError(err);
                    this.db.emit(DatabaseEvents.promiseError, err);

                    if (this.db.autoRollback && this.db.inTransaction) {
                        this.db
                            .rollback()
                            .then(_ => {
                                if (this.db.throwErrors) {
                                    reject(err);
                                } else {
                                    resolve();
                                }
                            })
                            .catch(reject);
                    } else if (this.db.throwErrors) {
                        reject(err);
                    } else {
                        resolve();
                    }

                    return;
                }

                resolve(new SqliteResult(rows, this.st));
            });
        });
    }

    each(...param) {
        return new Promise((resolve, reject) => {
            if (this.finalized) {
                const err = new DatabaseError("The statement is finalized");
                this.db.emit(DatabaseEvents.promiseError, err);

                if (this.db.throwErrors) {
                    reject(err);
                } else {
                    resolve();
                }

                return;
            }

            this.st.each(...param, (err, nrows) => {
                if (err) {
                    err = new DatabaseError(err);
                    this.db.emit(DatabaseEvents.promiseError, err);

                    if (this.db.autoRollback && this.db.inTransaction) {
                        this.db
                            .rollback()
                            .then(_ => {
                                if (this.db.throwErrors) {
                                    reject(err);
                                } else {
                                    resolve();
                                }
                            })
                            .catch(reject);
                    } else if (this.db.throwErrors) {
                        reject(err);
                    } else {
                        resolve();
                    }

                    return;
                }

                resolve(new SqliteResult(nrows, this.st));
            });
        });
    }
}

export default SqliteStatement;
