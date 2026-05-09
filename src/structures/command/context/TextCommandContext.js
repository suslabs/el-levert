import ParserUtil from "../../../util/commands/ParserUtil.js";

import BaseCommandContext from "./BaseCommandContext.js";
import CommandParser from "../../../parsers/CommandParser.js";

class TextCommandContext extends BaseCommandContext {
    get parser() {
        this._parser ??= new CommandParser(this);
        return this._parser;
    }

    splitArgs(lowercase = false, options = {}) {
        return ParserUtil.splitArgs(this.argsText, lowercase, options);
    }

    parseArgs(argDefs = this.command.arguments) {
        return this.parser.parseArguments(argDefs);
    }

    get parsedArgs() {
        this._parsedArgs ??= this.parseArgs();
        return this._parsedArgs;
    }

    arg(name) {
        return this.parsedArgs[name];
    }

    withArgs(argsText, overrides = {}) {
        return super.withArgs(argsText, {
            ...overrides,
            _parser: undefined,
            _parsedArgs: undefined
        });
    }
}

export default TextCommandContext;
