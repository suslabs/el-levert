function tagTester(name) {
    const tag = "[object " + name + "]";

    return obj => Object.prototype.toString.call(obj) === tag;
}

const isObject = tagTester("Object"),
    isFunction = tagTester("Function");

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
    if (typeof obj === "undefined") {
        return false;
    }

    return isFunction(obj.then);
}

export { isFunction, isObject, isClass, isPromise };
