import { GroupCommandReader } from "./reader/index.js";
import CommandReaderClasses from "./reader/CommandReaderClasses.js";

import { GroupCommandType } from "./type/index.js";
import CommandTypeClasses from "./type/CommandTypeClasses.js";

import CommandArgumentSchema from "./schema/CommandArgumentSchema.js";
import commandArgumentShorthands from "./schema/commandArgumentShorthands.js";

import CommandParseSession from "./structs/CommandParseSession.js";
import CommandArgument from "./structs/CommandArgument.js";
import CommandValidationIssue from "./structs/CommandValidationIssue.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";

import CommandError from "../../errors/CommandError.js";

class CommandParser {
    static parseInvocation(raw, prefix = "") {
        const content = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw,
            trimmed = content.trim();

        if (Util.empty(trimmed)) {
            return null;
        }

        const match = trimmed.match(/\s/);

        let name = trimmed,
            argsText = "";

        if (match) {
            const idx = match.index;

            name = trimmed.slice(0, idx);
            argsText = trimmed.slice(idx).trim();
        }

        return {
            raw,
            content,
            name,
            argsText
        };
    }

    constructor(command) {
        this.command = command;
        this.config = ObjectUtil.guaranteeObject(command.info?.parser);

        this.arguments = [];
        this.requireArgs = false;

        this._compileArguments();
    }

    parse(context) {
        const session = new CommandParseSession(context);

        try {
            this._parseArguments(session);
        } catch (err) {
            this._handleParseError(session, err);
        }

        session.applyNamedIssues();
        return session;
    }

    _parseArguments(session) {
        for (const arg of this.arguments) {
            session.addResult(arg.parse(session));
        }
    }

    _handleParseError(session, err) {
        if (err.name !== "ParserError") {
            throw err;
        }

        session.addIssue(new CommandValidationIssue("unclosed_quote", err.message, { index: err.index }));
    }

    _compileArguments() {
        const args = CommandArgumentSchema.compile(this.command.arguments ?? []),
            compiled = [];

        for (const arg of args) {
            this._compileArgument(arg, compiled);
        }

        this.arguments = compiled;

        const hasRequired = compiled.some(arg => arg.valid?.required === true);
        this.requireArgs = this.config.requireArgs === true || hasRequired;
    }

    _compileArgument(arg, compiled) {
        if (arg.kind === "group") {
            this._compileGroupArgument(arg, compiled);
            return;
        }

        compiled.push(this._createArgument(arg));
    }

    _compileGroupArgument(arg, compiled) {
        const properties = {};

        for (const [key, child] of Object.entries(arg.properties ?? {})) {
            const name = `${arg.name}_${key}`,
                childArg = {
                    ...child,
                    name,
                    from: child.from ?? arg.from ?? "args"
                };

            this._compileArgument(childArg, compiled);
            properties[key] = {
                name
            };
        }

        compiled.push(
            new CommandArgument(
                arg.name,
                arg.from ?? "args",
                new GroupCommandReader({
                    kind: "group",
                    properties
                }),
                new GroupCommandType({}),
                arg.valid,
                null,
                "group"
            )
        );
    }

    _createArgument(arg) {
        const typeName = this._normalizeTypeName(arg.type),
            reader = this._createReader(arg, typeName),
            type = this._createType(arg, typeName),
            lowercase = arg.reader?.lowercase ?? null;

        return new CommandArgument(arg.name, arg.from ?? "args", reader, type, arg.valid, lowercase, typeName);
    }

    _createReader(arg, typeName) {
        const readerDef = arg.reader;

        if (!readerDef) {
            return null;
        }

        const ReaderClass = CommandReaderClasses.get(readerDef.kind);

        if (typeof ReaderClass === "undefined") {
            throw new CommandError(`Unsupported command reader kind: ${readerDef.kind}`);
        }

        return new ReaderClass({
            ...readerDef,
            from: arg.from ?? "args",
            kind: readerDef.kind,
            name: arg.name,
            type: typeName
        });
    }

    _createType(arg, typeName) {
        const TypeClass = CommandTypeClasses.get(typeName);

        if (typeof TypeClass === "undefined") {
            throw new CommandError(`Unsupported command type: ${typeName}`);
        }

        return new TypeClass(typeof arg.type === "object" ? arg.type : {});
    }

    _normalizeTypeName(type) {
        const name = typeof type === "string" ? type : (type?.name ?? "string");
        return commandArgumentShorthands.type.fields[name] ?? name;
    }
}

export default CommandParser;
