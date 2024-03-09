function tagTester(name) {
    const tag = "[object " + name + "]";

    return obj => toString.call(obj) === tag;
}

const isObject = tagTester("Object"),
    isFunction = tagTester("Function");

function isPromise(obj) {
    if (!isObject(obj)) {
        return false;
    }

    return isFunction(obj.then) && isFunction(obj.catch);
}

export default isPromise;
