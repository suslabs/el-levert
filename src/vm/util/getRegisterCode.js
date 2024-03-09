const funcOptions = {
    arguments: {
        copy: true
    }
};

const indentation = 4,
    spaces = Array(indentation).fill(" ").join("");

function indent(code, times) {
    let lines = code.split("\n");

    lines = lines.map(line => {
        let newLine = "";

        for (let i = 0; i < times; i++) {
            newLine += spaces;
        }

        newLine += line;
        return newLine;
    });

    return lines.join("\n");
}

function funcBody(type, ret = true) {
    const prefix = ret ? "return" : "const res =",
        options = JSON.stringify(funcOptions, undefined, 4);

    const body = `${prefix} $0.${type}(undefined, args, ${options});`;

    return body;
}

function objDeclaration(objName) {
    const code = `
if(typeof ${objName} === "undefined") {
${spaces}${objName} = {};
}`;

    return code.trim();
}

function funcDeclaration(objName, funcName, body) {
    body = indent(body, 1);

    const code = `
${objName}.${funcName} = (...args) => {
${body}
}`;

    return code.trim();
}

function getClassName(_class) {
    return _class.prototype.constructor.name;
}

function classDeclaration(_class) {
    const className = getClassName(_class);

    let classCode = _class.toString();
    classCode = indent(classCode, 1);
    classCode = classCode.trim();

    const code = `
if(typeof ${className} === "undefined") {
${spaces}${className} = ${classCode};
}
`;

    return code.trim();
}

function closure(body) {
    const header = "(function() {\n",
        footer = "})();";

    body = indent(body, 1) + "\n";

    return header + body + footer;
}

function getRegisterCode(options, errorOptions = {}) {
    const { objName, funcName, type } = options,
        { errorClass } = errorOptions;

    const useError = typeof errorClass !== "undefined";

    let declCode = objDeclaration(objName),
        body = funcBody(type, !useError);

    if (useError) {
        const errName = getClassName(errorClass);

        declCode += `\n\n${classDeclaration(errorClass)}`;
        body += `\n\nthrow new ${errName}(res);`;
    }

    const code = `
${declCode}

${funcDeclaration(objName, funcName, body)}`;

    return closure(code.trim());
}

export default getRegisterCode;
