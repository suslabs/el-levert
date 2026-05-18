import { Buffer } from "node:buffer";

import TypeTester from "../TypeTester.js";
import ArrayUtil from "../ArrayUtil.js";

import UtilError from "../../errors/UtilError.js";

function bitsToBytes(numberOfBits) {
    return (numberOfBits >> 3) + Number(numberOfBits % 8 !== 0);
}

class BitField {
    static from(data = 0, options = {}) {
        return data instanceof this && Object.keys(options).length < 1 ? data.clone() : new this(data, options);
    }

    constructor(data = 0, options) {
        options = TypeTester.isObject(options) ? options : {};
        this.options = options;

        this._childValidate = this.validate;
        this.validate = this._validate.bind(this);

        this.grow = options.grow ? (Number.isFinite(options.grow) ? bitsToBytes(options.grow) : options.grow) : 0;
        this.invert = options.invert ?? false;
        this.buffer = new Uint8Array(typeof data === "number" ? bitsToBytes(data) : (data ?? 0));

        this.validate();
    }

    get length() {
        return this.buffer.length << 3;
    }

    get(bitIndex) {
        const byteIndex = bitIndex >> 3;
        return byteIndex < this.buffer.length && !!(this.buffer[byteIndex] & (1 << (bitIndex % 8)));
    }

    set(bitIndex, value = true) {
        this.constructor._validateBitIndex(bitIndex);
        return this._commitMutation(copy => copy._setBit(bitIndex, value));
    }

    setAll(array, offset = 0) {
        if (array == null || typeof array.length !== "number") {
            throw new UtilError("Invalid bit array", array);
        }

        this.constructor._validateBitIndex(offset);
        return this._commitMutation(copy => copy._setAllBits(array, offset));
    }

    setFlag(name, value = true, strict = true) {
        const bit = this.constructor._getFlagBit(name, strict);

        if (bit === false) {
            return this;
        }

        return this.set(bit, value);
    }

    setFlags(names, value = true, strict = true) {
        names = ArrayUtil.guaranteeArray(names);

        for (const name of names) {
            this.setFlag(name, value, strict);
        }

        return this;
    }

    forEach(callbackfn, start = 0, end = this.buffer.length * 8) {
        let byteIndex = start >> 3,
            bitMask = 1 << (start % 8);

        for (let bitIndex = start; bitIndex < end; bitIndex++) {
            callbackfn(!!(this.buffer[byteIndex] & bitMask), bitIndex);

            if (bitMask === 0b1000_0000) {
                byteIndex += 1;
                bitMask = 1;
            } else {
                bitMask <<= 1;
            }
        }
    }

    isEmpty() {
        for (let index = 0; index < this.buffer.length; index++) {
            if (this.buffer[index] !== 0) {
                return false;
            }
        }

        return true;
    }

    clone() {
        return new this.constructor(this.buffer.slice(), this._getCloneOptions());
    }

    equals(other) {
        if (!(other instanceof BitField)) {
            return false;
        }

        if (this.buffer.length !== other.buffer.length) {
            return false;
        }

        for (let index = 0; index < this.buffer.length; index++) {
            if (this.buffer[index] !== other.buffer[index]) {
                return false;
            }
        }

        return true;
    }

    toBuffer() {
        return Buffer.from(this.buffer);
    }

    toUnsignedNumber() {
        let value = 0n;

        for (let index = 0; index < this.buffer.length; index++) {
            value |= BigInt(this.buffer[index]) << BigInt(index * 8);
        }

        return Number(value);
    }

    toNumber() {
        const out = this.toUnsignedNumber();
        return this.invert ? -out : out;
    }

    valueOf() {
        return this.toNumber();
    }

    toJSON() {
        return this.toNumber();
    }

    validate() {}

    static _getFlagBit(name, strict = true) {
        if (!strict) {
            return false;
        }

        throw new UtilError("Named bits are not configured", name);
    }

    static _validateBitIndex(bitIndex) {
        if (!Number.isInteger(bitIndex) || bitIndex < 0) {
            throw new UtilError("Invalid bit index", bitIndex);
        }
    }

    _getCloneOptions() {
        return {
            grow: Number.isFinite(this.grow) ? this.grow << 3 : this.grow,
            invert: this.invert
        };
    }

    _commitMutation(callback) {
        const copy = this.clone();
        callback(copy);
        copy.validate();
        this.buffer = copy.buffer;
        this.invert = copy.invert;
        return this;
    }

    _setBit(bitIndex, value = true) {
        const byteIndex = bitIndex >> 3;

        if (value) {
            if (byteIndex >= this.buffer.length) {
                const newLength = Math.max(byteIndex + 1, Math.min(2 * this.buffer.length, this.grow));

                if (newLength <= this.grow) {
                    const newBuffer = new Uint8Array(newLength);
                    newBuffer.set(this.buffer);
                    this.buffer = newBuffer;
                }
            }

            if (byteIndex < this.buffer.length) {
                this.buffer[byteIndex] |= 1 << (bitIndex % 8);
            }
        } else if (byteIndex < this.buffer.length) {
            this.buffer[byteIndex] &= ~(1 << (bitIndex % 8));
        }
    }

    _setAllBits(array, offset = 0) {
        const targetLength = Math.min(bitsToBytes(offset + array.length), this.grow);

        if (this.buffer.length < targetLength) {
            const newBuffer = new Uint8Array(targetLength);
            newBuffer.set(this.buffer);
            this.buffer = newBuffer;
        }

        let byteIndex = offset >> 3,
            bitMask = 1 << (offset % 8);

        for (let index = 0; index < array.length; index++) {
            if (array[index]) {
                this.buffer[byteIndex] |= bitMask;
            } else {
                this.buffer[byteIndex] &= ~bitMask;
            }

            if (bitMask === 0b1000_0000) {
                byteIndex += 1;

                if (byteIndex >= this.buffer.length) {
                    break;
                }

                bitMask = 1;
            } else {
                bitMask <<= 1;
            }
        }
    }

    _validate() {
        if (typeof this._childValidate === "function") {
            this._childValidate();
        }

        return this;
    }
}

export default BitField;
