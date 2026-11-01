import Codegen from "./Codegen.js";

function callbackTypeCheck() {
    const check = Codegen.equals("typeof callback", Codegen.string("function"), false);
    return Codegen.if(check, Codegen.throw("TypeError", Codegen.string("Callback must be a function")));
}

function callbackEntry() {
    return Codegen.object(
        {
            callback: "callback",
            args: "args"
        },
        false
    );
}

function timerBody(registerName) {
    return [
        callbackTypeCheck(),
        Codegen.declaration("id", Codegen.call(registerName, "delay || 0", false), true),
        Codegen.call(Codegen.access(["__timers_callbacks", "set"]), ["id", callbackEntry()]),
        Codegen.return("id")
    ].join("\n\n");
}

function timerDeclaration(name, registerName) {
    return Codegen.assignment(
        Codegen.access(["globalThis", name]),
        Codegen.function(null, ["callback", "delay", "...args"], timerBody(registerName))
    );
}

function clearTimeoutBody() {
    return [
        Codegen.call("__timers_clear", "id"),
        Codegen.call(Codegen.access(["__timers_callbacks", "delete"]), "id")
    ].join("\n\n");
}

function clearTimeoutDeclaration() {
    return Codegen.assignment(
        Codegen.access(["globalThis", "clearTimeout"]),
        Codegen.function(null, "id", clearTimeoutBody())
    );
}

function clearIntervalDeclaration() {
    return Codegen.assignment(
        Codegen.access(["globalThis", "clearInterval"]),
        Codegen.access(["globalThis", "clearTimeout"])
    );
}

function executeTimerBody() {
    return [
        Codegen.declaration("entry", Codegen.call(Codegen.access(["__timers_callbacks", "get"]), "id", false), true),
        Codegen.if("entry", Codegen.call(Codegen.access(["entry", "callback"]), "...entry.args"))
    ].join("\n\n");
}

function executeTimerDeclaration() {
    return Codegen.assignment(
        Codegen.access(["globalThis", "__timers_execute"]),
        Codegen.function(null, "id", executeTimerBody())
    );
}

function clearCallbacksDeclaration() {
    return Codegen.assignment(
        Codegen.access(["globalThis", "__timers_clearCallbacks"]),
        Codegen.function(null, [], Codegen.call(Codegen.access(["__timers_callbacks", "clear"])))
    );
}

function removeCallbackDeclaration() {
    return Codegen.assignment(
        Codegen.access(["globalThis", "__timers_removeCallback"]),
        Codegen.function(null, "id", Codegen.call(Codegen.access(["__timers_callbacks", "delete"]), "id"))
    );
}

function getEventLoopCode() {
    return Codegen.closure(
        [
            Codegen.declaration("__timers_callbacks", "new Map()", true),
            timerDeclaration("setTimeout", "__timers_registerTimeout"),
            timerDeclaration("setInterval", "__timers_registerInterval"),
            clearTimeoutDeclaration(),
            clearIntervalDeclaration(),
            executeTimerDeclaration(),
            clearCallbacksDeclaration(),
            removeCallbackDeclaration()
        ].join("\n\n")
    );
}

export default getEventLoopCode;
