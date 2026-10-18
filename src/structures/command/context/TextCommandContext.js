import BaseCommandContext from "./BaseCommandContext.js";

import Util from "../../../util/Util.js";
import ObjectUtil from "../../../util/ObjectUtil.js";

import CommandError from "../../../errors/CommandError.js";

class TextCommandContext extends BaseCommandContext {
    static defaultValues = {
        ...BaseCommandContext.defaultValues
    };

    static dataProps = [...BaseCommandContext.dataProps];

    parseArgs() {
        this._parsedSession ??= this.command.parser.parse(this);
        return this._parsedSession;
    }

    arg(...args) {
        this._parsedSession ??= this.parseArgs();

        let options = {},
            names = args;

        if (!Util.empty(args)) {
            const last = args[args.length - 1];

            if (last && typeof last === "object" && !Array.isArray(last)) {
                options = last;
                names = args.slice(0, -1);
            }
        }

        const validate = options.validate ?? false;

        if (Util.empty(names)) {
            const obj = {};

            for (const [name, result] of this._parsedSession.results.entries()) {
                obj[name] = validate ? result : result.value;
            }

            return obj;
        }

        const results = [];

        for (const name of names) {
            const result = this._parsedSession.results.get(name);

            if (!result) {
                throw new CommandError(`Unknown argument name: ${name}`);
            }

            if (validate) {
                results.push(result);
            } else {
                results.push(result.value);
            }
        }

        return Util.single(names) ? Util.first(results) : results;
    }

    withArgs(argsText, overrides) {
        overrides = ObjectUtil.guaranteeObject(overrides);

        return super.withArgs(argsText, {
            ...overrides,
            _parsedSession: undefined
        });
    }
}

export default TextCommandContext;
