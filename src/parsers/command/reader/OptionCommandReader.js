import BaseCommandReader from "./BaseCommandReader.js";
import CommandTextLexer from "../CommandTextLexer.js";

import CommandValidationIssue from "../structs/CommandValidationIssue.js";

import CommandReaderKinds from "./CommandReaderKinds.js";
import OptionSyntaxTypes from "./OptionSyntaxTypes.js";

import Util from "../../../util/Util.js";

const booleanLiterals = new Set(["true", "false", "yes", "no", "1", "0", "on", "off", "y", "n", "t", "f"]);

class OptionCommandReader extends BaseCommandReader {
    static kind = CommandReaderKinds.option;

    constructor(options = {}) {
        super(options);

        this.syntax = this.options.syntax ?? OptionSyntaxTypes.dashed;
        this.isBoolean = this.options.type === "boolean";
        this.spellings = this._compileSpellings();
    }

    read(session) {
        const text = this.getSourceText(session),
            tokens = CommandTextLexer.lex(text),
            matches = this._readMatches(tokens);

        if (Util.empty(matches)) {
            return undefined;
        }

        if (this.usesArgsSource()) {
            session.removeArgsRanges(matches.map(match => match.range));
        }

        this._reportDuplicates(session, matches);
        return matches.at(-1).value;
    }

    _readMatches(tokens) {
        const matches = [];

        for (let i = 0; i < tokens.length; i++) {
            const match = this._readMatch(tokens, i);

            if (match === null) {
                continue;
            }

            matches.push(match.value);
            i = match.nextIndex;
        }

        return matches;
    }

    _readMatch(tokens, idx) {
        const token = tokens[idx];

        if (token?.type !== "text") {
            return null;
        }

        return this._readPrefixedMatch(tokens, idx, token) ?? this._readExactMatch(tokens, idx, token);
    }

    _readPrefixedMatch(tokens, idx, token) {
        const prefix = this.spellings.prefixes.find(value => token.value.startsWith(value));

        if (typeof prefix !== "string") {
            return null;
        }

        return {
            nextIndex: idx,
            value: {
                value: token.value.slice(prefix.length),
                range: [token.index, token.index + token.raw.length]
            }
        };
    }

    _readExactMatch(tokens, idx, token) {
        if (!this.spellings.exacts.includes(token.value)) {
            return null;
        }

        const eqToken = tokens[idx + 1];

        if (eqToken?.value === "=") {
            return this._readEqualsMatch(tokens, idx, token, eqToken);
        }

        if (this.isBoolean) {
            return this._readBooleanMatch(tokens, idx, token);
        }

        return this._readValueMatch(tokens, idx, token);
    }

    _readEqualsMatch(tokens, idx, token, eqToken) {
        const valueToken = tokens[idx + 2],
            rangeEnd = valueToken ? valueToken.index + valueToken.raw.length : eqToken.index + eqToken.raw.length;

        return {
            nextIndex: valueToken ? idx + 2 : idx + 1,
            value: {
                value: valueToken?.value ?? "",
                range: [token.index, rangeEnd]
            }
        };
    }

    _readBooleanMatch(tokens, idx, token) {
        const valueToken = tokens[idx + 1];

        if (valueToken && booleanLiterals.has(String(valueToken.value).toLowerCase())) {
            return {
                nextIndex: idx + 1,
                value: {
                    value: valueToken.value,
                    range: [token.index, valueToken.index + valueToken.raw.length]
                }
            };
        }

        return {
            nextIndex: idx,
            value: {
                value: "true",
                range: [token.index, token.index + token.raw.length]
            }
        };
    }

    _readValueMatch(tokens, idx, token) {
        const valueToken = tokens[idx + 1];

        if (!valueToken) {
            return {
                nextIndex: idx,
                value: {
                    value: undefined,
                    range: [token.index, token.index + token.raw.length]
                }
            };
        }

        return {
            nextIndex: idx + 1,
            value: {
                value: valueToken.value,
                range: [token.index, valueToken.index + valueToken.raw.length]
            }
        };
    }

    _reportDuplicates(session, matches) {
        for (let i = 0; i < matches.length - 1; i++) {
            session.addIssue(
                new CommandValidationIssue("duplicate_option", `Duplicate option: ${this.options.name}`, {
                    name: this.options.name
                })
            );
        }
    }

    _compileSpellings() {
        const exacts = [],
            prefixes = [];

        for (const spelling of this._getSpellings()) {
            exacts.push(...this._getExactSpellings(spelling));
            prefixes.push(...this._getPrefixSpellings(spelling));
        }

        return {
            exacts,
            prefixes
        };
    }

    _getSpellings() {
        const spellings = [];

        spellings.push({
            value: this.options.name,
            shorthand: false
        });

        for (const alias of this.options.aliases ?? []) {
            spellings.push({
                value: alias,
                shorthand: false
            });
        }

        if (typeof this.options.shorthand === "string") {
            spellings.push({
                value: this.options.shorthand,
                shorthand: true
            });
        }

        return spellings.filter(spelling => typeof spelling.value === "string" && !Util.empty(spelling.value));
    }

    _getExactSpellings(spelling) {
        const exacts = [];

        if (this.syntax === "dashed" || this.syntax === "both") {
            exacts.push(`${spelling.shorthand ? "-" : "--"}${spelling.value}`);
        }

        if (this.syntax === "named" || this.syntax === "both") {
            exacts.push(spelling.value);
        }

        return exacts;
    }

    _getPrefixSpellings(spelling) {
        return this._getExactSpellings(spelling).flatMap(value => [`${value}=`, `${value}:`]);
    }
}

export default OptionCommandReader;
