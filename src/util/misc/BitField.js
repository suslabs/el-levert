import { Buffer } from "node:buffer";

import Util from "../Util.js";
import ObjectUtil from "../ObjectUtil.js";
import ArrayUtil from "../ArrayUtil.js";
import TypeTester from "../TypeTester.js";

import BitFieldError from "../../errors/BitFieldError.js";

class BitField {
    static from(bits = 0, options = {}) {
        return bits instanceof this && Util.empty(Object.keys(options)) ? bits : new this(bits, options);
    }

    static toUint8Array(bits) {
        if (typeof bits === "number") {
            const bytes = Util.numberToBytes(bits);

            if (bytes === null) {
                throw new BitFieldError("Invalid bitfield data", bits);
            }

            return bytes;
        } else if (TypeTester.isArray(bits)) {
            return ArrayBuffer.isView(bits)
                ? new Uint8Array(bits.buffer, bits.byteOffset, bits.byteLength)
                : Uint8Array.from(bits);
        } else {
            throw new BitFieldError("Invalid bitfield data", bits);
        }
    }

    constructor(bits = 0, options) {
        bits ??= 0;
        options = ObjectUtil.guaranteeObject(options);
        this.options = options;

        this._childValidate = this.validate;
        this.validate = this._validate.bind(this);

        const grow = options.grow ?? 0;
        this.grow = Number.isFinite(grow) ? Math.ceil(grow / 8) : grow;
        this.buffer = this.constructor.toUint8Array(bits);

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
        return this._commitMutation(bitfield => bitfield._setBit(bitIndex, value));
    }

    setAll(array, offset = 0) {
        if (array == null || typeof array.length !== "number") {
            throw new BitFieldError("Invalid bit array", array);
        }

        this.constructor._validateBitIndex(offset);
        return this._commitMutation(bitfield => bitfield._setAllBits(array, offset));
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

        if (Util.empty(names)) {
            return this;
        }

        return this._commitMutation(bitfield => {
            for (const name of names) {
                const bit = bitfield.constructor._getFlagBit(name, strict);

                if (bit !== false) {
                    bitfield.constructor._validateBitIndex(bit);
                    bitfield._setBit(bit, value);
                }
            }
        });
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
        for (let i = 0; i < this.buffer.length; i++) {
            if (this.buffer[i] !== 0) {
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

        for (let i = 0; i < this.buffer.length; i++) {
            if (this.buffer[i] !== other.buffer[i]) {
                return false;
            }
        }

        return true;
    }

    toBuffer() {
        return Buffer.from(this.buffer);
    }

    toHex() {
        return Buffer.from(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength).toString("hex");
    }

    toNumber() {
        return Util.bytesToNumber(this.buffer);
    }

    validate() {}

    static _getFlagBit(name, strict = true) {
        if (!strict) {
            return false;
        }

        throw new BitFieldError("Named bits are not configured", name);
    }

    static _validateBitIndex(bitIndex) {
        if (!Number.isInteger(bitIndex) || bitIndex < 0) {
            throw new BitFieldError("Invalid bit index", bitIndex);
        }
    }

    _getCloneOptions() {
        return {
            grow: Number.isFinite(this.grow) ? this.grow * 8 : this.grow
        };
    }

    _startMutation() {
        this._mutation = {
            buffer: this.buffer,
            bytes: new Map()
        };

        return this._mutation;
    }

    _finishMutation() {
        delete this._mutation;
    }

    _rollbackMutation(mutation) {
        this.buffer = mutation.buffer;

        for (const [byteIndex, byte] of mutation.bytes) {
            this.buffer[byteIndex] = byte;
        }

        delete this._mutation;
    }

    _commitMutation(callback) {
        const mutation = this._startMutation();

        try {
            callback(this);
            this.validate();
            this._finishMutation();
        } catch (err) {
            this._rollbackMutation(mutation);
            throw err;
        }

        return this;
    }

    _recordByte(byteIndex) {
        const mutation = this._mutation;

        if (typeof mutation !== "undefined" && !mutation.bytes.has(byteIndex)) {
            mutation.bytes.set(byteIndex, this.buffer[byteIndex]);
        }
    }

    _growBuffer(newLength) {
        if (newLength > this.grow || newLength <= this.buffer.length) {
            return;
        }

        const newBuffer = new Uint8Array(newLength);
        newBuffer.set(this.buffer);
        this.buffer = newBuffer;
    }

    _setBit(bitIndex, value = true) {
        const byteIndex = bitIndex >> 3;

        if (value) {
            if (byteIndex >= this.buffer.length) {
                const newLength = Math.max(byteIndex + 1, Math.min(2 * this.buffer.length, this.grow));

                this._growBuffer(newLength);
            }

            if (byteIndex < this.buffer.length) {
                this._recordByte(byteIndex);
                this.buffer[byteIndex] |= 1 << (bitIndex % 8);
            }
        } else if (byteIndex < this.buffer.length) {
            this._recordByte(byteIndex);
            this.buffer[byteIndex] &= ~(1 << (bitIndex % 8));
        }
    }

    _setAllBits(array, offset = 0) {
        const targetLength = Math.min(Math.ceil((offset + array.length) / 8), this.grow);

        if (this.buffer.length < targetLength) {
            this._growBuffer(targetLength);
        }

        let byteIndex = offset >> 3,
            bitMask = 1 << (offset % 8);

        for (let i = 0; i < array.length; i++) {
            this._recordByte(byteIndex);

            if (array[i]) {
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
