import BaseCommandReader from "./BaseCommandReader.js";
import CommandTextLexer from "../CommandTextLexer.js";

import CommandReaderKinds from "./CommandReaderKinds.js";

import Util from "../../../util/Util.js";
import ObjectUtil from "../../../util/ObjectUtil.js";
import ArrayUtil from "../../../util/ArrayUtil.js";

const defaultSeparators = [" ", "\n"];

class PositionalCommandReader extends BaseCommandReader {
    static kind = CommandReaderKinds.positional;

    static split(str, options) {
        str = String(str ?? "");
        const { separators, nth, lowercase } = PositionalCommandReader._normalizeSplitConfig(options);

        if (Util.empty(separators)) {
            return PositionalCommandReader._formatSplitResult(str, "", lowercase);
        }

        const match = PositionalCommandReader._findSeparator(str, separators, nth);

        if (match === null) {
            return PositionalCommandReader._formatSplitResult(str, "", lowercase);
        }

        const first = str.slice(0, match.index),
            second = str.slice(match.index + match.length);

        return PositionalCommandReader._formatSplitResult(first, second, lowercase);
    }

    constructor(options = {}) {
        super(options);

        this.separators = PositionalCommandReader._normalizeSeparators(this.options.separator);
        this.index = this.options.index ?? 0;
    }

    read(session) {
        const text = this.getSourceText(session),
            tokens = this._lex(text);

        if (tokens.length <= this.index) {
            return undefined;
        }

        if (!this.usesArgsSource()) {
            return this._getTokenValue(text, tokens);
        }

        session.argsIndex = Math.max(session.argsIndex, this.index + 1);
        return this._getTokenValue(text, tokens);
    }

    static _normalizeSplitConfig(options) {
        options = ObjectUtil.guaranteeObject(options);

        return {
            separators: PositionalCommandReader._normalizeSeparators(options.separator),
            nth: Number.isInteger(options.n) && options.n > 0 ? options.n : 1,
            lowercase: options.lowercase === true
        };
    }

    static _findSeparator(str, separators, nth) {
        let count = 0;

        for (let i = 0; i < str.length; i++) {
            for (const separator of separators) {
                if (!str.startsWith(separator, i)) {
                    continue;
                }

                count++;

                if (count === nth) {
                    return {
                        index: i,
                        length: separator.length
                    };
                }
            }
        }

        return null;
    }

    static _normalizeSeparators(separators) {
        return ArrayUtil.guaranteeArray(separators ?? defaultSeparators)
            .map(separator => (typeof separator === "string" ? separator : ""))
            .filter(separator => !Util.empty(separator));
    }

    static _formatSplitResult(first, second, lowercase) {
        return [lowercase ? String(first).toLowerCase() : String(first), String(second)];
    }

    _lex(text) {
        if (Util.empty(this.separators)) {
            return [];
        }

        return CommandTextLexer.lex(text, this.separators);
    }

    _getTokenValue(text, tokens) {
        if (this.index === 0) {
            return Util.first(tokens).value;
        }

        return text.slice(tokens[this.index].index);
    }
}

export default PositionalCommandReader;
