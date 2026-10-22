function createEnum(definitions, modifier) {
    const isArray = Array.isArray(definitions),
        entries = isArray ? definitions.map(key => [key, key]) : Object.entries(definitions);

    const obj = Object.fromEntries(entries),
        keys = entries.map(([key]) => key),
        values = entries.map(([, val]) => val);

    const valid = new Set(values),
        descriptors = {};

    if (!("keys" in obj)) {
        descriptors.keys = { value: Object.freeze(keys) };
    }

    if (!("values" in obj)) {
        descriptors.values = { value: Object.freeze(values) };
    }

    if (!("valid" in obj)) {
        descriptors.valid = { value: valid, writable: true, configurable: true };
    }

    if (!("has" in obj)) {
        descriptors.has = { value: val => obj.valid.has(val) };
    }

    descriptors[Symbol.iterator] = { value: () => obj.valid[Symbol.iterator]() };

    Object.defineProperties(obj, descriptors);

    if (typeof modifier === "function") {
        const res = modifier(obj);

        if (res instanceof Set) {
            obj.valid = res;
        }
    }

    return Object.freeze(obj);
}

export default createEnum;
