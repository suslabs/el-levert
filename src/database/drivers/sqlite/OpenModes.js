import sqlite from "sqlite3";

const OpenModes = {
    OPEN_READONLY: sqlite.OPEN_READONLY,
    OPEN_READWRITE: sqlite.OPEN_READWRITE,
    OPEN_CREATE: sqlite.OPEN_CREATE,
    OPEN_RWCREATE: sqlite.OPEN_READWRITE | sqlite.OPEN_CREATE
};

export default OpenModes;
