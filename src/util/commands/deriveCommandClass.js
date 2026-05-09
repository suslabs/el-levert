function deriveCommandClass(wrapperClass, plainClass) {
    const derivedClass = class DerivedCommand extends wrapperClass {};
    const descriptors = Object.getOwnPropertyDescriptors(plainClass.prototype);

    delete descriptors.constructor;
    Object.defineProperties(derivedClass.prototype, descriptors);

    Object.defineProperty(derivedClass, "plainClass", {
        value: plainClass,
        configurable: true
    });

    return derivedClass;
}

export default deriveCommandClass;
