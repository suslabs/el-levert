import Util from "../Util.js";
import ArrayUtil from "../ArrayUtil.js";

const Codegen = {
    get indentation() {
        return Codegen._indentation;
    },

    set indentation(val) {
        Codegen._indentation = val;
        Codegen.spaces = " ".repeat(Codegen._indentation);
    },

    indent: (code, times = 1) => {
        code = String(code ?? "").trim();

        const spaces = Codegen.spaces.repeat(times);

        if (Util.empty(code)) {
            return spaces;
        }

        let lines = code.split("\n");
        lines = lines.map(line => spaces + line);

        return lines.join("\n");
    },

    isIdentifier: str => {
        return Codegen._identifierExp.test(str);
    },

    identifier: str => {
        return Codegen.isIdentifier(str) ? str : JSON.stringify(str);
    },

    isStatement: str => {
        return !Codegen._statementExp.test(str);
    },

    statement: (code, force = false) => {
        code = String(code ?? "").trim();

        if (Util.empty(code)) {
            return ";";
        } else if (force) {
            return code + ";";
        }

        const last_nl = code.lastIndexOf("\n");

        let replaced = last_nl ? code.slice(last_nl) : code;
        replaced = replaced.replaceAll(" ", "");

        return code + (Codegen.isStatement(replaced) ? "" : ";");
    },

    declaration: (name, value, isConst = false, statement = true) => {
        const type = isConst ? "const" : "let";

        name = String(name).trim();
        value = String(value ?? "").trim() ?? "";

        const body = Util.empty(value) ? `${type} ${name}` : `${type} ${name} = ${value}`;
        return statement ? Codegen.statement(body, true) : body;
    },

    assignment: (name, value, statement = true) => {
        name = String(name).trim();
        value = String(value).trim();

        const body = `${name} = ${value}`;
        return statement ? Codegen.statement(body, true) : body;
    },

    string: value => {
        let char, escaped;

        if (value.includes("\n")) {
            char = "`";
            escaped = value.replace(/`/g, "\\`");
        } else if (value.includes('"')) {
            char = "'";
            escaped = value.replace(/'/g, "\\'");
        } else {
            char = '"';
            escaped = value.replace(/"/g, '\\"');
        }

        return `${char}${escaped}${char}`;
    },

    array: (arr, brackets = true) => {
        const values = arr.map(val => String(val).trim()).join(", ");
        return brackets ? `[${values}]` : values;
    },

    object: (obj, asJson = true) => {
        if (asJson) {
            const str = JSON.stringify(obj, undefined, Codegen.indentation);
            return str.replace(Codegen._objectKeyExp, "$1$2:");
        } else {
            return Codegen.block(
                Object.entries(obj)
                    .map(([key, value]) => `${Codegen.identifier(key)}: ${String(value)}`)
                    .join(",\n"),
                false
            );
        }
    },

    equals: (name, value, is = true, strict = true) => {
        const check = is ? "=" : "!",
            equals = "=" + (strict ? "=" : "");

        return `${name} ${check}${equals} ${value}`;
    },

    isUndefined: (name, is = true) => {
        const type = `typeof ${name}`;
        return Codegen.equals(type, Codegen._undef, is);
    },

    access: (names, statement = false) => {
        names = ArrayUtil.guaranteeArray(names);

        names = names.map((name, i) => {
            const first = i === 0,
                last = i === names.length - 1;

            let dynamic = false,
                optional = false;

            if (typeof name === "object") {
                const opts = name;
                name = opts.name;

                dynamic = opts.dynamic ?? false;

                if (!last) {
                    optional = opts.optional ?? false;
                }
            }

            return {
                first,
                last,

                name,

                dynamic,
                optional
            };
        });

        const tokens = names.map(opts => {
            if (opts.first) {
                return opts.name;
            }

            const chain = opts.optional ? "?." : "";

            if (opts.dynamic) {
                return chain + `[${opts.name}]`;
            } else {
                return chain + Codegen.isIdentifier(opts.name) ? `.${opts.name}` : `[${JSON.stringify(opts.name)}]`;
            }
        });

        const body = tokens.join("");
        return statement ? Codegen.statement(body) : body;
    },

    block: (body, statement = true) => {
        const header = "{\n",
            footer = "\n}";

        if (statement) {
            body = Codegen.statement(body);
        }

        return header + Codegen.indent(body) + footer;
    },

    return: (value, statement = true) => {
        const name = "return";

        let body = null;

        if (Array.isArray(value)) {
            body = `${name} ${Codegen.array(value)}`;
        } else {
            value = String(value).trim();
            body = Util.empty(value) ? name : `${name} ${value}`;
        }

        return statement ? Codegen.statement(body) : body;
    },

    throw: (err, msg, statement = true) => {
        err = String(err ?? "").trim();

        let name = "throw",
            value = Util.empty(msg) ? "undefined" : msg;

        if (!Util.empty(err)) {
            value = Codegen.instantiate(err, value);
        }

        const body = `${name} ${value}`;
        return statement ? Codegen.statement(body) : body;
    },

    function: (name, args, body, options = {}) => {
        name = String(name ?? "").trim();
        args = ArrayUtil.guaranteeArray(args, null, true);

        const cls = options.class ?? false,
            arrow = options.arrow ?? false;

        let header = `(${args.join(", ")}) `;

        if (arrow) {
            header += "=> ";
        } else {
            name = name?.trim();

            if (!Util.empty(name)) {
                header = `${name}${header}`;
            }

            if (!cls) {
                header = `function ${header}`;
            }
        }

        return header + Codegen.block(body);
    },

    if(expr, ifBody, elseBody) {
        expr = String(expr ?? "").trim();

        const ifHeader = `if (${expr}) `,
            elseHeader = "else ";

        const ifBlock = ifHeader + Codegen.block(ifBody);

        if (Util.empty(elseBody)) {
            return ifBlock;
        } else {
            const elseBlock = elseHeader + Codegen.block(elseBody);
            return `${ifBlock} ${elseBlock}`;
        }
    },

    call: (name, args, statement = true) => {
        name = String(name).trim();
        args = ArrayUtil.guaranteeArray(args, null, true);

        const values = Codegen.array(args, false),
            body = `${name}(${values})`;

        return statement ? Codegen.statement(body) : body;
    },

    instantiate: (name, args, statement = true) => {
        return `new ${Codegen.call(name, args, statement)}`;
    },

    closure: body => {
        const header = "(function() ",
            footer = Codegen.statement(")()");

        return header + Codegen.block(body) + footer;
    },

    tryCatch: (tryBody, catchBody, errName = "err") => {
        errName = String(errName ?? "").trim();

        const tryHeader = "try ",
            catchHeader = `catch (${errName}) `;

        const tryBlock = tryHeader + Codegen.block(tryBody),
            catchBlock = catchHeader + Codegen.block(catchBody);

        return `${tryBlock} ${catchBlock}`;
    },

    class: (name, extnds, body) => {
        name = String(name ?? "").trim();
        extnds = String(extnds ?? "").trim();

        let header = `class `;

        if (!Util.empty(name)) {
            header += `${name} `;
        }

        if (!Util.empty(extnds)) {
            header += `extends ${extnds} `;
        }

        return header + Codegen.block(body, false);
    },

    getObject: code => {
        return new Function(Codegen.return(code))();
    },

    _identifierExp: /^[A-Za-z_$][A-Za-z0-9_$]*$/,
    _objectKeyExp: /^(\s*)"([A-Za-z_$][A-Za-z0-9_$]*)":/gm,

    _statementExp: /[\s\S]*[\w\d$_)\]]$/
};

{
    Codegen.indentation = 4;

    Codegen._undef = Codegen.string("undefined");
}

export default Codegen;
