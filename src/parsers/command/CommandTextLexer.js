import CommandToken from "./structs/CommandToken.js";
import CommandQuotedValue from "./structs/CommandQuotedValue.js";

import ArrayUtil from "../../util/ArrayUtil.js";

import ParserError from "../../errors/ParserError.js";

class CommandTextLexer {
    static quotes = ['"', "'"];
    static defaultSeparators = [" ", "\n"];

    constructor(str, separators = CommandTextLexer.defaultSeparators) {
        this.str = String(str ?? "");
        this.separators = ArrayUtil.guaranteeArray(separators);
        this.idx = 0;
    }

    get done() {
        return this.idx >= this.str.length;
    }

    *[Symbol.iterator]() {
        let token = this.nextToken();

        while (token !== null) {
            yield token;
            token = this.nextToken();
        }
    }

    nextToken() {
        this._skipSeparators();

        if (this.idx >= this.str.length) {
            return null;
        }

        return this._readToken();
    }

    lex() {
        const tokens = [];
        let token = this.nextToken();

        while (token !== null) {
            tokens.push(token);
            token = this.nextToken();
        }

        return tokens;
    }

    _getSeparatorLength(idx) {
        for (const separator of this.separators) {
            if (separator && this.str.startsWith(separator, idx)) {
                return separator.length;
            }
        }

        return 0;
    }

    _skipSeparators() {
        let length = this._getSeparatorLength(this.idx);

        while (length > 0 && this.idx < this.str.length) {
            this.idx += length;
            length = this._getSeparatorLength(this.idx);
        }
    }

    _isOpeningQuote(char, start, idx) {
        if (!CommandTextLexer.quotes.includes(char)) {
            return false;
        }

        if (idx === start) {
            return true;
        }

        const prevChar = this.str[idx - 1];
        return prevChar === "=" || prevChar === ":";
    }

    _isQuotedToken(raw) {
        return raw.length >= 2 && CommandTextLexer.quotes.some(quote => raw.startsWith(quote) && raw.endsWith(quote));
    }

    _createToken(cooked, raw, start) {
        const quoted = this._isQuotedToken(raw);

        return new CommandToken(
            quoted ? "quoted" : "text",
            quoted ? new CommandQuotedValue(cooked, raw[0]) : cooked,
            raw,
            start
        );
    }

    _readToken() {
        const start = this.idx;

        let cooked = "",
            inQuote = false,
            quoteChar = null;

        while (this.idx < this.str.length) {
            if (!inQuote && this._getSeparatorLength(this.idx) > 0) {
                break;
            }

            const char = this.str[this.idx];

            if (!inQuote) {
                if (char === "\\") {
                    const nextChar = this.str[this.idx + 1];

                    if (typeof nextChar !== "undefined") {
                        cooked += nextChar;
                        this.idx += 2;
                        continue;
                    }

                    cooked += "\\";
                    this.idx += 1;
                    continue;
                }

                if (this._isOpeningQuote(char, start, this.idx)) {
                    inQuote = true;
                    quoteChar = char;
                    this.idx += 1;
                    continue;
                }

                cooked += char;
                this.idx += 1;
                continue;
            }

            if (char === "\\") {
                const nextChar = this.str[this.idx + 1];

                if (nextChar === quoteChar || nextChar === "\\") {
                    cooked += nextChar;
                    this.idx += 2;
                    continue;
                }

                cooked += "\\";
                this.idx += 1;
                continue;
            }

            if (char === quoteChar) {
                inQuote = false;
                this.idx += 1;
                continue;
            }

            cooked += char;
            this.idx += 1;
        }

        if (inQuote) {
            throw new ParserError("Unclosed quote", start);
        }

        const raw = this.str.slice(start, this.idx);
        return this._createToken(cooked, raw, start);
    }
}

export default CommandTextLexer;
