function isObject(obj) {
    return obj !== null && typeof obj === "object";
}

function isClass(obj) {
    if (typeof obj !== "function") {
        return false;
    }

    if (obj.toString().startsWith("class")) {
        return true;
    }

    return Object.getOwnPropertyNames(obj.prototype).length > 1;
}

function isPromise(obj) {
    return typeof obj?.then === "function";
}

export { isObject, isClass, isPromise };
