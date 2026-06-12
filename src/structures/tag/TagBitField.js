import { Buffer } from "node:buffer";

import BitField from "../../util/misc/BitField.js";

import { TagTypes } from "./TagTypes.js";

import TypeTester from "../../util/TypeTester.js";

import TagError from "../../errors/TagError.js";

class TagBitField extends BitField {
    static from(data = TagTypes.defaults.flags, options) {
        data ??= TagTypes.defaults.flags;
        return super.from(data, options);
    }

    static query(data = null) {
        if (data === null) {
            return {
                $types: JSON.stringify(this._getTypeData().map(type => type.toString("hex")))
            };
        }

        const flag = data instanceof TagBitField ? data : this.from(data);

        return {
            $types: JSON.stringify(
                flag.isEmpty() ? this._getTypeData().map(type => type.toString("hex")) : this._getQueryTypes(flag)
            )
        };
    }

    static filter(names, include = true) {
        const filter = this.from(new Uint8Array(), {
            include
        });

        return filter.setFlags(names);
    }

    constructor(data = TagTypes.defaults.flags, options) {
        data ??= TagTypes.defaults.flags;
        options = TypeTester.isObject(options) ? options : {};

        const include = options.include ?? true;
        options.grow ??= TagTypes.flags.entries.length;

        if (data instanceof Map) {
            data = TagBitField._getMapData(data);
        } else if (!ArrayBuffer.isView(data)) {
            throw new TagError("Invalid type", data);
        }

        super(data, options);
        this.include = include;
    }

    hasFlag(name) {
        return this.get(TagBitField._getFlagBit(name));
    }

    validate() {
        this.forEach((set, bit) => {
            if (set && !TagTypes.flags.bits.has(bit)) {
                throw new TagError("Invalid type", this.toBuffer());
            }
        });

        for (const [name, flag] of TagTypes.flags.entries) {
            if (!this.hasFlag(name)) {
                continue;
            }

            for (const [requiredName, requiredValue] of Object.entries(flag.requires)) {
                if (this.hasFlag(requiredName) !== requiredValue) {
                    throw new TagError(`Flag ${name} requires ${requiredName}`, {
                        name,
                        requiredName,
                        requiredValue
                    });
                }
            }
        }
    }

    static _getFlagBit(name, strict = true) {
        if (!TagTypes.flags.valid.has(name)) {
            if (!strict) {
                return false;
            }

            TypeTester.normalizeEnum(name, TagTypes.flags.valid, "flag", TagError, {
                unknown: "Unknown"
            });
        }

        return TagTypes.flags[name].bit;
    }

    static _getMapData(map) {
        const data = new Uint8Array(Math.ceil(TagTypes.flags.entries.length / 8));

        for (const [name, value] of map) {
            const bit = this._getFlagBit(name);

            if (value) {
                data[bit >> 3] |= 1 << (bit % 8);
            }
        }

        return data;
    }

    static _hasBit(data, name) {
        const bit = this._getFlagBit(name),
            byte = bit >> 3;

        return byte < data.length && !!(data[byte] & (1 << (bit % 8)));
    }

    static _validData(data) {
        for (const [name, flag] of TagTypes.flags.entries) {
            if (!this._hasBit(data, name)) {
                continue;
            }

            for (const [requiredName, requiredValue] of Object.entries(flag.requires)) {
                if (this._hasBit(data, requiredName) !== requiredValue) {
                    return false;
                }
            }
        }

        return true;
    }

    static _collectTypeData(data, idx, out) {
        if (idx >= TagTypes.flags.entries.length) {
            if (this._validData(data)) {
                out.push(Buffer.from(data));
            }

            return;
        }

        const bit = TagTypes.flags.entries[idx][1].bit,
            byte = bit >> 3,
            mask = 1 << (bit % 8);

        data[byte] &= ~mask;
        this._collectTypeData(data, idx + 1, out);

        data[byte] |= mask;
        this._collectTypeData(data, idx + 1, out);
    }

    static _getTypeData() {
        if (Array.isArray(this._typeData)) {
            return this._typeData;
        }

        const data = new Uint8Array(Math.ceil(TagTypes.flags.entries.length / 8)),
            out = [];

        this._collectTypeData(data, 0, out);
        this._typeData = out;

        return out;
    }

    static _matchesFilter(type, filter) {
        for (let i = 0; i < filter.buffer.length; i++) {
            const masked = (type[i] ?? 0) & filter.buffer[i],
                matched = filter.include ? masked === filter.buffer[i] : masked === 0;

            if (!matched) {
                return false;
            }
        }

        return true;
    }

    static _getQueryTypes(filter) {
        return this._getTypeData()
            .filter(type => this._matchesFilter(type, filter))
            .map(type => type.toString("hex"));
    }

    static _validateBitIndex(bit) {
        if (!TagTypes.flags.bits.has(bit)) {
            throw new TagError("Invalid type flag bit", bit);
        }
    }

    _getCloneOptions() {
        return {
            ...super._getCloneOptions(),
            include: this.include
        };
    }
}

export default TagBitField;
