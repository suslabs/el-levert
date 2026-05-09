import ParserUtil from "../util/commands/ParserUtil.js";
import Util from "../util/Util.js";

import ParserError from "../errors/ParserError.js";

class CommandParser {
    constructor(context = {}) {
        this.context = context;
    }

    parse() {
        const { content } = this.context,
            raw = this.context.raw ?? content;

        if (typeof content !== "string") {
            return null;
        }

        const [name, argsText] = ParserUtil.splitArgs(content);

        return {
            raw,
            content,
            name,
            argsText
        };
    }

    parseArgument(def, parsed = {}) {
        if (def == null || typeof def !== "object") {
            throw new ParserError("Invalid command argument definition", {
                def,
                context: this.context
            });
        }

        const parser = def.parser ?? "value",
            source = this.constructor._resolveArgumentSource(def, this.context, parsed);

        let value;

        if (typeof parser === "function") {
            value = parser(source, this.context, parsed, def);
        } else {
            switch (parser) {
                case "value":
                    value = source;
                    break;
                case "split":
                    value = ParserUtil.splitArgs(`${source ?? ""}`, def.lowercase ?? false, def.options ?? {})[
                        def.index ?? 0
                    ];
                    break;
                case "words":
                case "parts":
                    value = `${source ?? ""}`
                        .split(def.sep ?? " ")
                        .filter(part => ((def.filterEmpty ?? true) ? !Util.empty(part) : true));

                    if (def.lowercase === true) {
                        value = value.map(part => part.toLowerCase());
                    }

                    break;
                case "match":
                    if (!(def.regex instanceof RegExp)) {
                        throw new ParserError("Match parser requires a regex", {
                            parser,
                            argument: def.name,
                            def
                        });
                    }

                    value = `${source ?? ""}`.match(def.regex)?.[def.index ?? 0];
                    break;
                case "script":
                    value = ParserUtil.parseScript(`${source ?? ""}`)[def.key ?? "body"];
                    break;
                default:
                    throw new ParserError("Unknown command argument parser", {
                        parser,
                        argument: def.name,
                        def
                    });
            }
        }

        const missingValue = typeof value === "undefined",
            emptyValue = def.useDefaultOnEmpty && Util.empty(value),
            hasDefaultValue = "defaultValue" in def;

        if (hasDefaultValue && (missingValue || emptyValue)) {
            const { defaultValue } = def;
            value = typeof defaultValue === "function" ? defaultValue(this.context, parsed, def) : defaultValue;
        }

        if (def.transform != null) {
            value = this.constructor._applyTransform(value, def.transform, this.context, parsed, def);
        }

        return value;
    }

    parseArguments(argDefs = this.context.command?.arguments) {
        const defs = Array.isArray(argDefs) ? argDefs : [],
            parsed = {};

        for (const def of defs) {
            if (!Util.nonemptyString(def?.name)) {
                throw new ParserError("Command argument definition must have a name", {
                    def,
                    context: this.context
                });
            }

            parsed[def.name] = this.parseArgument(def, parsed);
        }

        return parsed;
    }

    static _resolvePath(source, path) {
        if (typeof path !== "string" || path.length < 1) {
            return source;
        }

        return path.split(".").reduce((value, key) => value?.[key], source);
    }

    static _resolveArgumentSource(def, context, parsed) {
        const from = def.from ?? "argsText";

        if (typeof from === "function") {
            return from(context, parsed, def);
        } else if (typeof from !== "string") {
            return from;
        } else if (from in parsed) {
            return parsed[from];
        } else if (from.startsWith("parseResult.")) {
            return this._resolvePath(context.parseResult, from.slice("parseResult.".length));
        } else if (from.startsWith("context.")) {
            return this._resolvePath(context, from.slice("context.".length));
        } else {
            return this._resolvePath(context, from);
        }
    }

    static _applyTransform(value, transform, context, parsed, def) {
        if (Array.isArray(transform)) {
            return transform.reduce(
                (currentValue, currentTransform) =>
                    this._applyTransform(currentValue, currentTransform, context, parsed, def),
                value
            );
        } else if (typeof transform === "function") {
            return transform(value, context, parsed, def);
        } else if (Array.isArray(value)) {
            return value.map(item => this._applyTransform(item, transform, context, parsed, def));
        }

        switch (transform) {
            case "int":
                return Util.parseInt(value);
            case "float":
                return Number.parseFloat(value);
            case "lowercase":
                return typeof value === "string" ? value.toLowerCase() : value;
            default:
                throw new ParserError("Unknown command argument transform", {
                    transform,
                    argument: def?.name,
                    def,
                    value
                });
        }
    }
}

export default CommandParser;
