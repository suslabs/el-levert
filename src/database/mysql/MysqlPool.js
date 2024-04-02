import mysql from "mysql";
import EventEmitter from "events";

import PoolEvents from "./PoolEvents.js";

class MysqlPool extends EventEmitter {
    constructor(config) {
        this.config = config;
        this.pool = mysql.createPool(config);

        if (typeof config.throwErrors === "boolean") {
            this.throwErrors = onfig.throwErrors;
        } else {
            this.throwErrors = true;
        }

        this.registerEvents();
    }

    registerEvent(event) {
        this.pool.on(event, ...args => this.emit(event, ...args));
    }

    registerEvents() {
        for (const event of Object.values(PoolEvents)) {
            this.registerEvent(event);
        }
    }

    getConnection() {}
}

export default MysqlPool;
