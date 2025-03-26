import Util from "../Util.js";
import Codegen from "./Codegen.js";

const funcOptions = {
    arguments: {
        copy: true
    }
};

const optionsStr = JSON.stringify(funcOptions, undefined, 4);

function funcBody(type, ret) {
    const call = Codegen.call(`$0.${type}`, ["undefined", "args", optionsStr]);

    if (ret) {
        return Codegen.return(call);
    } else {
        return Codegen.declaration("res", call, true);
    }
}

function objDeclaration(objName) {
    if (Util.empty(objName)) {
        return "";
    }

    const decl = Codegen.assignment(objName, "{}");
    return Codegen.if(Codegen.isUndefined(objName), decl);
}

function funcDeclaration(objName, funcName, body) {
    let name = funcName;

    if (!Util.empty(objName)) {
        name = Codegen.access([objName, name]);
    }

    const func = Codegen.function(null, "...args", body, {
        arrow: true
    });

    return Codegen.assignment(name, func);
}

function classDeclaration(_class, global) {
    const className = Util.className(_class),
        classCode = _class.toString().trim();

    if (global) {
        const decl = Codegen.assignment(className, classCode);
        return Codegen.if(Codegen.isUndefined(className), decl);
    }

    return classCode;
}

function getRegisterCode(options, errorOptions = {}) {
    const { objName, funcName, type } = options;

    const errClass = errorOptions.class,
        useError = typeof errClass !== "undefined",
        errAccessible = errorOptions.accessible ?? false;

    let declCode = objDeclaration(objName),
        body = funcBody(type, !useError);

    if (useError) {
        const errName = Util.className(errClass),
            errDecl = classDeclaration(errClass, errAccessible);

        if (errAccessible) {
            if (!Util.empty(declCode)) {
                declCode += "\n\n";
            }

            declCode += errDecl;
        } else {
            body = `${errDecl}\n\n${body}`;
        }

        body += "\n\n" + Codegen.throw(errName, "res");
    }

    const code = `
${declCode}

${funcDeclaration(objName, funcName, body)}`;

    return Codegen.closure(code);
}

export default getRegisterCode;
