import VMFunction from "../../structures/vm/VMFunction.js";

import Util from "../Util.js";
import Codegen from "./Codegen.js";
import TypeTester from "../TypeTester.js";

function objDeclaration(objName) {
    if (Util.empty(objName)) {
        return "";
    }

    const decl = Codegen.assignment(objName, "{}");
    return Codegen.if(Codegen.isUndefined(objName), decl);
}

function classDeclaration(_class, global) {
    const className = TypeTester.className(_class),
        classCode = _class.toString().trim();

    if (global) {
        const decl = Codegen.assignment(className, classCode);
        return Codegen.if(Codegen.isUndefined(className), decl);
    }

    return classCode;
}

function resultBody(call, ret, errName) {
    if (ret) {
        return Codegen.return(call);
    }

    let body = Codegen.declaration("res", call, true);

    if (!Util.empty(errName)) {
        body += "\n\n" + Codegen.throw(errName, "res");
    }

    return body;
}

function refFuncBody(type, ret, errName) {
    const callOptionsStr = Codegen.object(VMFunction.callOptions),
        call = Codegen.call(Codegen.access(["$0", type]), ["undefined", "args", callOptionsStr]);

    return resultBody(call, ret, errName);
}

function refFuncDeclaration(objName, funcName, ret, errName, type) {
    let name = funcName;

    if (!Util.empty(objName)) {
        name = Codegen.access([objName, name]);
    }

    const body = refFuncBody(type, ret, errName),
        decl = Codegen.function(null, "...args", body, {
            arrow: true
        });

    return Codegen.assignment(name, decl);
}

function stringFuncBody(name, ret, errName) {
    const call = Codegen.call(name, ["...args"]);
    return resultBody(call, ret, errName);
}

function stringFuncDeclaration(objName, funcName, ret, errName, func) {
    let name = funcName;

    if (!Util.empty(objName)) {
        name = Codegen.access([objName, name]);
    }

    const funcBody = func.toString(),
        funcDecl = funcBody.startsWith("function") ? funcBody : Codegen.declaration(func.name, funcBody, true);

    const wrapperBody = stringFuncBody(func.name, ret, errName),
        wrapperDecl = Codegen.function(null, "...args", wrapperBody, {
            arrow: true
        });

    return [funcDecl, Codegen.assignment(name, wrapperDecl)].join("\n\n");
}

function getRegisterCode(options, funcOptions = {}, errorOptions = {}) {
    const { objName, funcName, type } = options;

    const stringFunc = funcOptions.stringFunc ?? false,
        func = funcOptions.func;

    const errClass = errorOptions.class,
        useError = typeof errClass !== "undefined";

    const errName = useError ? TypeTester.className(errClass) : "",
        errAccessible = errorOptions.accessible ?? false;

    const commonArgs = [objName, funcName, !useError, errName];

    let objDeclCode = objDeclaration(objName),
        funcDeclCode = "";

    if (useError) {
        const errDecl = classDeclaration(errClass, errAccessible);

        if (errAccessible) {
            if (!Util.empty(objDeclCode)) {
                objDeclCode += "\n\n";
            }

            objDeclCode += errDecl;
        } else {
            funcDeclCode = errDecl + "\n\n";
        }
    }

    if (stringFunc) {
        funcDeclCode += stringFuncDeclaration(...commonArgs, func);
    } else {
        funcDeclCode += refFuncDeclaration(...commonArgs, type);
    }

    const code = `${objDeclCode}\n\n${funcDeclCode}`;
    return Codegen.closure(code);
}

export default getRegisterCode;
