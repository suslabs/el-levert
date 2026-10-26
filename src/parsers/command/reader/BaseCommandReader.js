import ObjectUtil from "../../../util/ObjectUtil.js";

import ParserError from "../../../errors/ParserError.js";

class BaseCommandReader {
    constructor(options = {}) {
        this.options = ObjectUtil.guaranteeObject(options);
        this.kind = this.constructor.kind ?? this.options.kind ?? null;

        if (typeof this.read !== "function") {
            throw new ParserError("Child class must have a read function");
        }

        this._childRead = this.read;
        this.read = this._read.bind(this);
    }

    read(...args) {
        return this._childRead.apply(this, args);
    }

    getSourceText(session) {
        return session.getSourceText(this.options.from);
    }

    usesArgsSource() {
        return (this.options.from ?? "args") === "args";
    }

    _read(...args) {
        return this._childRead.apply(this, args);
    }
}

export default BaseCommandReader;
