import fs from "node:fs/promises";
import path from "node:path";

import DiscordClient from "../../client/DiscordClient.js";
import Tag from "../../structures/tag/Tag.js";

import { getClient } from "../../LevertClient.js";

import Util from "../Util.js";
import ObjectUtil from "../ObjectUtil.js";
import FileUtil from "../misc/FileUtil.js";

import CommandError from "../../errors/CommandError.js";

function makeObjectRule(properties, options) {
    return Object.freeze({
        type: "object",
        defaultValue: {},
        additionalProperties: false,
        properties,
        ...ObjectUtil.guaranteeObject(options)
    });
}

function makeCliArg(name, options) {
    return Object.freeze({
        name,
        kind: "option",
        aliases: [Util.camelCaseToKebab(name)],
        ...ObjectUtil.guaranteeObject(options)
    });
}

function makeFieldRule(field) {
    if (Array.isArray(field.fields)) {
        return makeObjectRule(makeSchemaProperties(field.fields));
    }

    return {
        type: field.type
    };
}

function makeSchemaProperties(fields) {
    return Object.fromEntries(fields.map(field => [field.name, makeFieldRule(field)]));
}

function makeGroupProperties(fields) {
    return Object.fromEntries(
        fields.map(field => [
            field.name,
            Array.isArray(field.fields)
                ? {
                      kind: "group",
                      properties: makeGroupProperties(field.fields)
                  }
                : {
                      type: field.type
                  }
        ])
    );
}

function makeCliFieldName(prefix, name) {
    return Util.nonemptyString(prefix) ? prefix + Util.capitalize(name) : name;
}

function makeCliFieldArg(prefix, field) {
    return makeCliArg(makeCliFieldName(prefix, field.name), {
        type: field.type
    });
}

function getCliFields(fields, prefix = "") {
    return fields.flatMap(field => {
        if (Array.isArray(field.fields)) {
            const nextPrefix = field.cliPrefix;

            if (!Util.nonemptyString(nextPrefix)) {
                return [];
            }

            const fullPrefix = makeCliFieldName(prefix, nextPrefix);
            return getCliFields(field.fields, fullPrefix);
        }

        return [makeCliFieldArg(prefix, field)];
    });
}

function makeCliArgs(fields) {
    return getCliFields(fields);
}

function makeOverride(fields, getValue) {
    return ObjectUtil.removeUndefinedValues(Object.fromEntries(fields.map(field => [field.name, getValue(field)])));
}

function makeObjectFieldValue(source, field) {
    if (Array.isArray(field.fields)) {
        const value = makeObjectOverride(source[field.name], field.fields);
        return !Util.empty(Object.keys(value)) ? value : undefined;
    }

    return source[field.name];
}

function makeObjectOverride(source, fields) {
    source = ObjectUtil.guaranteeObject(source);
    return makeOverride(fields, field => makeObjectFieldValue(source, field));
}

function makeCliFieldValue(source, prefix, field) {
    if (Array.isArray(field.fields)) {
        const nextPrefix = field.cliPrefix;

        if (!Util.nonemptyString(nextPrefix)) {
            return undefined;
        }

        const fullPrefix = makeCliFieldName(prefix, nextPrefix),
            value = makeCliOverride(source, field.fields, fullPrefix);

        return !Util.empty(Object.keys(value)) ? value : undefined;
    }

    return source[makeCliFieldName(prefix, field.name)];
}

function makeCliOverride(source, fields, prefix = "") {
    source = ObjectUtil.guaranteeObject(source);

    return makeOverride(fields, field => makeCliFieldValue(source, prefix, field));
}

function makeEmulationOptions(options) {
    options = ObjectUtil.guaranteeObject(options);
    return [!Util.empty(Object.keys(options)), options];
}

function makeResolvedBody(body, options) {
    options = ObjectUtil.guaranteeObject(options);

    return {
        body,
        err: null,
        guessedPath: false,
        isScript: false,
        language: "",
        path: null,
        ...options
    };
}

const EmulationCommandUtil = Object.freeze({
    getMessageCliArguments: () => makeCliArgs(DiscordClient.emulatableMessageFields),

    getTagCliArguments: () => getCliFields(Tag.emulatableFields, "tag"),

    getMessageGroupProperties: () => makeGroupProperties(DiscordClient.emulatableMessageFields),

    getTagGroupProperties: () => makeGroupProperties(Tag.emulatableFields),

    getMessageSchema: () => ({
        type: "object",
        defaultValue: {},
        additionalProperties: false,
        properties: makeSchemaProperties(DiscordClient.emulatableMessageFields)
    }),

    getTagSchema: () => ({
        type: "object",
        required: false,
        additionalProperties: false,
        properties: makeSchemaProperties(Tag.emulatableFields)
    }),

    normalizeMessageOptions: options => makeObjectOverride(options, DiscordClient.emulatableMessageFields),

    normalizeCliMessageOptions: args => makeCliOverride(args, DiscordClient.emulatableMessageFields),

    getCliMessageOptions: ctx => EmulationCommandUtil.normalizeCliMessageOptions(ctx.arg()),

    normalizeTagOptions: options => makeObjectOverride(options, Tag.emulatableFields),

    getTagOptions: options => makeEmulationOptions(EmulationCommandUtil.normalizeTagOptions(options)),

    normalizeCliTagOptions: args => makeCliOverride(args, Tag.emulatableFields, "tag"),

    getCliTagOptions: ctx => makeEmulationOptions(EmulationCommandUtil.normalizeCliTagOptions(ctx.arg())),

    resolveGuessedPathBody: async (body, options) => {
        options = ObjectUtil.guaranteeObject(options);
        const name = options.name ?? "file";

        if (!Util.nonemptyString(body)) {
            return makeResolvedBody(body);
        }

        if (EmulationCommandUtil._looksLikeAbsolutePath(body)) {
            return await EmulationCommandUtil._resolvePathBody(body, name, true);
        } else if (!EmulationCommandUtil._looksLikeRelativePath(body)) {
            return makeResolvedBody(body);
        }

        return await EmulationCommandUtil._resolvePathBody(body, name, false);
    },

    createMessageInput: async (content, override) => {
        override = EmulationCommandUtil.normalizeMessageOptions(override);

        const client = getClient(),
            emulatedMsg = await client.emulateMessage(content, override),
            user_id = emulatedMsg.author?.id ?? client.owner ?? "0";

        return {
            override,
            user_id,
            emulatedMsg
        };
    },

    createCliMessageInput: (ctx, content) =>
        EmulationCommandUtil.createMessageInput(content, EmulationCommandUtil.getCliMessageOptions(ctx)),

    getCliTagArgs: (ctx, emulateTag) => {
        const execTagName = ctx.arg("execTagName"),
            remainingArgs = ctx.arg("execTagArgs");

        if (emulateTag) {
            return (execTagName ? execTagName + (remainingArgs ? " " + remainingArgs : "") : "").trim();
        }

        return (remainingArgs ?? "").trim();
    },

    setupCliEmulation: async ctx => {
        const [emulateTag, tagOptions] = EmulationCommandUtil.getCliTagOptions(ctx),
            execTagName = ctx.arg("execTagName");

        let tag = null;

        if (emulateTag) {
            const parsedBody = await EmulationCommandUtil.resolveGuessedPathBody(tagOptions.body, {
                name: "tag body"
            });

            if (parsedBody.err !== null) {
                throw new CommandError(parsedBody.err.message);
            }

            if (parsedBody.guessedPath) {
                tagOptions.body = parsedBody.body;

                if (parsedBody.isScript) {
                    tagOptions.type ??= "script";
                    tagOptions.language ??= parsedBody.language;
                }
            }

            tag = getClient().tagManager.emulateTag(tagOptions);
        } else {
            if (Util.empty(execTagName)) {
                throw new CommandError("Missing required argument: tagName.");
            }

            tag = await getClient().tagManager.fetch(execTagName);
        }

        const tagArgs = EmulationCommandUtil.getCliTagArgs(ctx, emulateTag),
            { emulatedMsg } = await EmulationCommandUtil.createCliMessageInput(ctx, tagArgs);

        return {
            tag,
            tagArgs,
            emulatedMsg
        };
    },

    setupWebsocketEmulation: async ctx => {
        const tagName = ctx.args.name,
            args = ctx.args.args,
            [emulateTag, tagOptions] = EmulationCommandUtil.getTagOptions(ctx.args.tag);

        let tag = null;

        if (emulateTag) {
            tag = getClient().tagManager.emulateTag(tagOptions);
        } else {
            if (!Util.nonemptyString(tagName)) {
                throw new CommandError("Missing required parameter: name");
            }

            tag = await getClient().tagManager.fetch(tagName);
        }

        const { emulatedMsg } = await EmulationCommandUtil.createMessageInput(args, ctx.args.msg);

        return {
            tag,
            tagArgs: args,
            emulatedMsg
        };
    },

    _looksLikeAbsolutePath: value => FileUtil.looksLikeAbsolutePath(value),

    _looksLikeRelativePath: value => FileUtil.looksLikeRelativePath(value),

    _getPathResult: (body, filePath, options) =>
        makeResolvedBody(body, {
            guessedPath: true,
            path: filePath,
            ...EmulationCommandUtil._getScriptInfo(filePath),
            ...options
        }),

    _getPathError: (name, reason, err) => {
        switch (reason) {
            case "missing":
                return {
                    level: "warn",
                    message: `The provided ${name} path doesn't point to an existing file`
                };
            case "directory":
                return {
                    level: "warn",
                    message: `The provided ${name} path points to a directory, not a file`
                };
            default:
                return {
                    level: "error",
                    message: `Reading the provided ${name} path failed: ${err.message}`
                };
        }
    },

    _getScriptInfo: filePath => {
        switch (path.extname(filePath).toLowerCase()) {
            case ".cjs":
            case ".js":
            case ".mjs":
                return {
                    isScript: true,
                    language: "js"
                };
            case ".cts":
            case ".mts":
            case ".ts":
                return {
                    isScript: true,
                    language: "ts"
                };
            default:
                return {
                    isScript: false,
                    language: ""
                };
        }
    },

    _resolveLocalPath: value => {
        const normalized = FileUtil.normalizeLocalPath(value);
        return normalized === value ? FileUtil.resolve(value) : normalized;
    },

    _resolvePathBody: async (value, name, required) => {
        const filePath = EmulationCommandUtil._resolveLocalPath(value);

        let stat;

        try {
            stat = await fs.stat(filePath);
        } catch (err) {
            if (!required && err.code === "ENOENT") {
                return makeResolvedBody(value);
            }

            return makeResolvedBody(null, {
                err: EmulationCommandUtil._getPathError(name, "missing", err)
            });
        }

        if (!stat.isFile()) {
            if (!required && !stat.isDirectory()) {
                return makeResolvedBody(value);
            }

            return makeResolvedBody(null, {
                err: EmulationCommandUtil._getPathError(name, stat.isDirectory() ? "directory" : "missing")
            });
        }

        try {
            const body = await fs.readFile(filePath, "utf8");
            return EmulationCommandUtil._getPathResult(body, filePath);
        } catch (err) {
            return makeResolvedBody(null, {
                err: EmulationCommandUtil._getPathError(name, "read", err)
            });
        }
    }
});

export default EmulationCommandUtil;
