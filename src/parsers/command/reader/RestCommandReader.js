import BaseCommandReader from "./BaseCommandReader.js";
import CommandTextLexer from "../CommandTextLexer.js";

import CommandReaderKinds from "./CommandReaderKinds.js";

import Util from "../../../util/Util.js";

class RestCommandReader extends BaseCommandReader {
    static kind = CommandReaderKinds.rest;

    read(session) {
        const text = this.getSourceText(session);

        if (!this.usesArgsSource()) {
            return text;
        }

        const lexer = new CommandTextLexer(text),
            tokens = lexer.lex();

        if (Util.empty(tokens)) {
            session.argsIndex = 0;
            return "";
        }

        if (session.argsIndex <= 0) {
            session.argsIndex = tokens.length;
            return text.trim();
        }

        if (session.argsIndex >= tokens.length) {
            session.argsIndex = tokens.length;
            return "";
        }

        const token = tokens[session.argsIndex];

        session.argsIndex = tokens.length;

        return text.slice(token.index).trim();
    }
}

export default RestCommandReader;
