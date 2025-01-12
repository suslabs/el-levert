const funcOptions = {
    arguments: {
        copy: true
    }
};

const indentation = 4,
    spaces = " ".repeat(indentation);

function indent(code, times = 1) {
    let lines = code.split("\n");
    lines = lines.map(line => spaces.repeat(times) + line);

    return lines.join("\n");
}

function funcBody(type, ret) {
    const prefix = ret ? "return" : "const res =",
        options = JSON.stringify(funcOptions, undefined, 4);

    const body = `${prefix} $0.${type}(undefined, args, ${options});`;

    return body;
}

function objDeclaration(objName) {
    if (typeof objName === "undefined" || objName.length < 1) {
        return "";
    }

    const code = `
if(typeof ${objName} === "undefined") {
${spaces}${objName} = {};
}
`;

    return code.trim();
}

function funcDeclaration(objName, funcName, body) {
    body = indent(body);
    let code = "";

    if (typeof objName !== "undefined" && objName.length > 0) {
        code += `${objName}.`;
    }

    code += `
${funcName} = (...args) => {
${body}
}
`.trim();

    return code;
}

function getClassName(_class) {
    return _class.prototype.constructor.name;
}

function classDeclaration(_class, global) {
    const className = getClassName(_class);

    let classCode = _class.toString().trim(),
        code;

    if (global) {
        classCode = indent(classCode).trimStart();

        code = `
if(typeof ${className} === "undefined") {
${spaces}${className} = ${classCode};
}
        `;
    } else {
        code = classCode;
    }

    return code.trim();
}

function closure(body) {
    const header = "(function() {\n",
        footer = "\n})();";

    body = indent(body);
    return header + body + footer;
}

function getRegisterCode(options, errorOptions = {}) {
    const { objName, funcName, type } = options;

    const errClass = errorOptions.class,
        useError = typeof errClass !== "undefined",
        errAccessible = errorOptions.accessible ?? true;

    let declCode = objDeclaration(objName),
        body = funcBody(type, !useError);

    if (useError) {
        const errName = getClassName(errClass),
            errDecl = classDeclaration(errClass, errAccessible);

        if (errAccessible) {
            if (declCode.length > 0) {
                declCode += "\n\n";
            }

            declCode += errDecl;
        } else {
            body = `${errDecl}\n\n${body}`;
        }

        body += `\n\nthrow new ${errName}(res);`;
    }

    const code = `
${declCode}

${funcDeclaration(objName, funcName, body)}`;

    return closure(code.trim());
}

export default getRegisterCode;
