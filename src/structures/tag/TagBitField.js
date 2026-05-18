import { Buffer } from "node:buffer";

import BitField from "../../util/misc/BitField.js";

import TagError from "../../errors/TagError.js";

class TagBitField extends BitField {
    static configure(schema) {
        this._flagBits = schema.flags.bits;
        this._validMask = Object.values(this._flagBits).reduce((mask, bit) => mask | (1 << bit), 0);

        this._requirements = schema.flags.entries.flatMap(([name, config]) =>
            config.requiredFlags.map(required => ({
                name,
                bit: config.bit,
                requiredBit: this._flagBits[required.name],
                value: required.value
            }))
        );
    }

    static filter(data = null, invert) {
        if (typeof data === "string" || Array.isArray(data)) {
            data = this.fromFlags(data);
        } else if (typeof data === "number" && data < 0) {
            invert = true;
            data = Math.abs(data);
        } else if (invert == null && data instanceof BitField) {
            invert = data.invert;
        }

        return this.from(data, {
            invert: Boolean(invert)
        });
    }

    static fromFlags(names, options = {}) {
        return this.from(null, options).setFlags(names, true, false);
    }

    static query(filter = null) {
        if (filter == null) {
            return {
                $flag: null
            };
        }

        filter = this.filter(filter);

        if (filter.isEmpty()) {
            return {
                $flag: null
            };
        }

        return {
            $flag: filter.toNumber()
        };
    }

    static is(value) {
        return value instanceof this;
    }

    static isFilter(value) {
        return value instanceof this && value.invert;
    }

    constructor(data = null, options = {}) {
        const ctor = new.target;

        if (data instanceof BitField) {
            options = {
                ...data._getCloneOptions?.(),
                invert: data.invert,
                ...options
            };
            data = data.buffer;
        }

        super(Uint8Array.of(ctor._coerceByte(data)), {
            grow: 8,
            ...options
        });
    }

    validate() {
        this.constructor._validateByte(this.toUnsignedNumber());
    }

    static _throwInvalid(data) {
        throw new TagError("Invalid type", data);
    }

    static _validateBitIndex(bitIndex) {
        if (!Number.isInteger(bitIndex) || bitIndex < 0) {
            this._throwInvalid(bitIndex);
        }
    }

    static _getFlagBit(name, strict = true) {
        if (typeof name !== "string" || name.length < 1) {
            if (!strict) {
                return false;
            }

            throw new TagError("Invalid flag");
        }

        const bit = this._flagBits[name];

        if (typeof bit === "undefined") {
            throw new TagError("Unknown flag: " + name, name);
        }

        return bit;
    }

    static _coerceByte(data) {
        if (data == null) {
            return 0;
        }

        if (typeof data === "number") {
            if (Number.isInteger(data) && data >= 0 && data <= 255) {
                return data;
            }

            this._throwInvalid(data);
        }

        if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
            if (data.length <= 1) {
                return data[0] ?? 0;
            }

            this._throwInvalid(data);
        }

        this._throwInvalid(data);
    }

    static _validateByte(value) {
        if (!Number.isInteger(value) || value < 0 || value > 255 || (value & ~this._validMask) !== 0) {
            this._throwInvalid(value);
        }

        for (const rule of this._requirements) {
            if ((value & (1 << rule.bit)) !== 0 && Boolean(value & (1 << rule.requiredBit)) !== rule.value) {
                this._throwInvalid(value);
            }
        }
    }
}

export default TagBitField;
