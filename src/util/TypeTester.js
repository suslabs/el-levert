function tagTester(name) {
    const tag = "[object " + name + "]";

    return obj => toString.call(obj) === tag;
}

const isFunction = tagTester("Function");

function isPromise(obj) {
    if (typeof obj === "undefined") {
        return false;
    }

    return isFunction(obj.then);
}

export { isPromise };
