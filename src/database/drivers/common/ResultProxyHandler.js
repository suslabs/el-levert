import { dataProps, infoProps, passthroughProps } from "./ResultProperties.js";

const ResultProxyHandler = {
    get: (target, prop) => {
        if (passthroughProps.includes(prop)) {
            return target[prop];
        }

        switch (typeof prop) {
            case "symbol":
                return target[prop];
            case "string":
                if (prop.startsWith("_")) {
                    const privProp = prop.slice(1);

                    if (privProp === "obj") {
                        return target;
                    }

                    if (dataProps.includes(privProp)) {
                        return target[privProp];
                    }
                }

                if (infoProps.includes(prop)) {
                    return target.info[prop];
                }
            default:
                if (target.data === null || typeof target.data === "undefined") {
                    return;
                }

                return target.data[prop];
        }
    },
    set: (target, prop, newVal) => {
        if (passthroughProps.includes(prop)) {
            Reflect.set(target, prop, newVal);
            return true;
        }

        switch (typeof prop) {
            case "symbol":
                Object.defineProperty(target, prop, {
                    configurable: true,
                    writable: true,
                    enumerable: false,
                    value: newVal
                });

                return true;
            case "string":
                if (prop.startsWith("_")) {
                    const privProp = prop.slice(1);

                    if (privProp === "obj" || dataProps.includes(privProp)) {
                        return false;
                    }
                }

                if (infoProps.includes(prop)) {
                    return false;
                }
            default:
                target.data[prop] = newVal;
        }
    },
    has: (target, prop) => {
        if (typeof prop === "symbol" || passthroughProps.includes(prop)) {
            return prop in target;
        }

        return prop in target.info || prop in target.data;
    },
    ownKeys: target => {
        return Reflect.ownKeys(target.data);
    },
    getOwnPropertyDescriptor: (target, prop) => {
        const dataProp = Reflect.getOwnPropertyDescriptor(target.data, prop);
        dataProp.configurable = true;

        return dataProp;
    }
};

export default ResultProxyHandler;
