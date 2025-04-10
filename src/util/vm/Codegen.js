import Util from "../Util.js";

const Codegen = {
    get indentation() {
        return Codegen._indentation;
    },

    set indentation(val) {
        Codegen._indentation = val;
        Codegen.spaces = " ".repeat(Codegen._indentation);
    },

    indent: (code, times = 1) => {
        code = code?.toString().trim() ?? "";

        const spaces = Codegen.spaces.repeat(times);

        if (Util.empty(code)) {
            return spaces;
        }

        let lines = code.split("\n");
        lines = lines.map(line => spaces + line);

        return lines.join("\n");
    },

    statement: (code, force = false) => {
        code = code?.toString().trim() ?? "";

        if (Util.empty(code)) {
            return ";";
        }

        if (force) {
            return code + ";";
        }

        const last_nl = code.lastIndexOf("\n");

        let replaced = last_nl ? code.slice(last_nl) : code;
        replaced = replaced.replaceAll(" ", "");

        if (Codegen._statementExp.test(replaced)) {
            return code + ";";
        }

        return code;
    },

    declaration: (name, value, isConst = false) => {
        const type = isConst ? "const" : "let";

        name = name.toString().trim();
        value = value?.toString().trim() ?? "";

        if (Util.empty(value)) {
            return Codegen.statement(`${type} ${name}`);
        }

        return Codegen.statement(`${type} ${name} = ${value}`);
    },

    assignment: (name, value, statement = true) => {
        name = name.toString().trim();
        value = value.toString().trim();

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
        const values = arr.map(val => val.toString().trim()).join(", ");
        return brackets ? `[${values}]` : values;
    },

    object: obj => {
        const jsonStr = JSON.stringify(obj, null, 2);
        return jsonStr.replace(/"([^"]+)":/g, "$1:");
    },

    equals: (name, value, flag = true, strict = true) => {
        const check = flag ? "=" : "!",
            equals = "=" + (strict ? "=" : "");

        return `${name} ${check}${equals} ${value}`;
    },

    isUndefined: (name, is = true) => {
        const type = `typeof ${name}`;
        return Codegen.equals(type, Codegen._undef, is);
    },

    access: names => {
        if (!Array.isArray(names)) {
            names = [names];
        }

        const tokens = names.map((name, i) => {
            let optional = false;

            if (Array.isArray(name)) {
                if (i === names.length - 1) {
                    [name] = name;
                } else {
                    [name, optional] = name;
                }
            }

            return name + (optional ? "?" : "");
        });

        return tokens.join(".");
    },

    block: (body, statement = true) => {
        const header = "{\n",
            footer = "\n}";

        if (statement) {
            body = Codegen.statement(body);
        }

        return header + Codegen.indent(body) + footer;
    },

    return: value => {
        const name = "return";

        if (Util.empty(value)) {
            return Codegen.statement(name);
        } else if (Array.isArray(value)) {
            return Codegen.statement(`${name} ${Codegen.array(value)}`);
        }

        value = value.toString().trim();
        return Codegen.statement(`${name} ${value}`);
    },

    throw: (err, msg) => {
        const name = "throw";

        err = err?.toString().trim() ?? "";

        let value = "";

        if (Util.empty(msg)) {
            value = "null";
        } else if (!Array.isArray(msg)) {
            msg = [msg];
        }

        if (Array.isArray(msg)) {
            value = Codegen.array(msg, false);
        }

        if (!Util.empty(err)) {
            value = "new " + Codegen.call(err, value);
        }

        return Codegen.statement(`${name} ${value}`);
    },

    function: (name, args, body, options = {}) => {
        name = name?.toString().trim() ?? "";

        if (args == null) {
            args = [];
        } else if (!Array.isArray(args)) {
            args = [args];
        }

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
        expr = expr?.toString().trim() ?? "";

        const ifHeader = `if (${expr}) `,
            elseHeader = "else ";

        const ifBlock = ifHeader + Codegen.block(ifBody);

        if (Util.empty(elseBody)) {
            return ifBlock;
        }

        const elseBlock = elseHeader + Codegen.block(elseBody);
        return `${ifBlock} ${elseBlock}`;
    },

    call: (name, args) => {
        name = name.toString().trim();

        if (args == null) {
            args = [];
        } else if (!Array.isArray(args)) {
            args = [args];
        }

        const values = Codegen.array(args, false);
        return Codegen.statement(`${name}(${values})`);
    },

    closure: body => {
        const header = "(function() ",
            footer = Codegen.statement(")()");

        return header + Codegen.block(body) + footer;
    },

    tryCatch: (tryBody, catchBody, errName = "err") => {
        errName = errName?.toString().trim() ?? "";

        const tryHeader = "try ",
            catchHeader = `catch (${errName}) `;

        const tryBlock = tryHeader + Codegen.block(tryBody),
            catchBlock = catchHeader + Codegen.block(catchBody);

        return `${tryBlock} ${catchBlock}`;
    },

    class: (name, extnds, body) => {
        name = name?.toString().trim() ?? "";
        extnds = extnds?.toString().trim() ?? "";

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

    _statementExp: /[\s\S]*[\w\d$_)\]]$/
};

{
    Codegen.indentation = 4;

    Codegen._undef = Codegen.string("undefined");
}

export default Codegen;
