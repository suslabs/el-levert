import ObjectUtil from "../../../util/ObjectUtil.js";

import ParserError from "@el-levert/common/errors/ParserError.js";

class BaseWebsocketReader {
    constructor(options = {}) {
        this.options = ObjectUtil.guaranteeObject(options);

        if (typeof this.read !== "function") {
            throw new ParserError("Child class must have a read function");
        }

        this._childRead = this.read;
        this.read = this._read.bind(this);
    }

    read(...args) {
        return this._childRead.apply(this, args);
    }

    _read(...args) {
        return this._childRead.apply(this, args);
    }
}

export default BaseWebsocketReader;
