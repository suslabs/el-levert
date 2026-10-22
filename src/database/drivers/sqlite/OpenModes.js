import sqlite from "sqlite3";

import createEnum from "../../../util/createEnum.js";

const OpenModes = createEnum({
    OPEN_READONLY: sqlite.OPEN_READONLY,
    OPEN_READWRITE: sqlite.OPEN_READWRITE,
    OPEN_CREATE: sqlite.OPEN_CREATE,
    OPEN_RWCREATE: sqlite.OPEN_READWRITE | sqlite.OPEN_CREATE
});

export default OpenModes;
