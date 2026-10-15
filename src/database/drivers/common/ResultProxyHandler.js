import { dataProps, infoProps, passthroughProps, targetProp } from "./ResultProperties.js";

import Util from "../../../util/Util.js";

const instances = new WeakMap();

const ResultProxyHandler = Object.freeze({
    registerTarget: (target, instance) => {
        instances.set(target, instance);
    },

    get: (target, prop) => {
        const instance = instances.get(target) ?? target;

        if (passthroughProps.includes(prop)) {
            const method = instance[prop];
            return typeof method === "function" ? method.bind(instance) : method;
        }

        switch (typeof prop) {
            case "symbol":
                return target[prop] ?? instance[prop];
            case "string":
                if (prop.startsWith("_")) {
                    const privProp = Util.after(prop, 0);

                    if (privProp === targetProp) {
                        return instance;
                    } else if (dataProps.includes(privProp)) {
                        return instance[privProp];
                    }
                }

                if (infoProps.includes(prop)) {
                    return instance.info[prop];
                }
            // eslint-disable-next-line no-fallthrough
            default:
                if (Array.isArray(target)) {
                    return Reflect.get(target, prop);
                }

                return target.data?.[prop];
        }
    },

    set: (target, prop, newVal) => {
        const instance = instances.get(target) ?? target;

        if (passthroughProps.includes(prop)) {
            return Reflect.set(instance, prop, newVal);
        }

        switch (typeof prop) {
            case "symbol":
                if (Array.isArray(target)) {
                    target[prop] = newVal;
                    return true;
                }

                Object.defineProperty(target, prop, {
                    configurable: true,
                    writable: true,
                    enumerable: false,
                    value: newVal
                });

                return true;
            case "string":
                if (prop.startsWith("_")) {
                    const privProp = Util.after(prop, 0);

                    if (privProp === targetProp || dataProps.includes(privProp)) {
                        return false;
                    }
                }

                if (infoProps.includes(prop)) {
                    return false;
                }
            // eslint-disable-next-line no-fallthrough
            default:
                if (Array.isArray(target)) {
                    return Reflect.set(target, prop, newVal);
                }

                target.data[prop] = newVal;
                return true;
        }
    },

    deleteProperty: (target, prop) => {
        const instance = instances.get(target) ?? target;

        if (passthroughProps.includes(prop)) {
            return Reflect.deleteProperty(instance, prop);
        }

        switch (typeof prop) {
            case "symbol":
                return Reflect.deleteProperty(target, prop);
            case "string":
                if (prop.startsWith("_")) {
                    const privProp = Util.after(prop, 0);

                    if (privProp === targetProp || dataProps.includes(privProp)) {
                        return false;
                    }
                }

                if (infoProps.includes(prop)) {
                    return false;
                }
            // eslint-disable-next-line no-fallthrough
            default:
                if (Array.isArray(target)) {
                    return Reflect.deleteProperty(target, prop);
                }

                return delete target.data?.[prop];
        }
    },

    has: (target, prop) => {
        const instance = instances.get(target) ?? target;

        if (typeof prop === "symbol" || passthroughProps.includes(prop)) {
            return prop in target || prop in instance;
        }

        if (Array.isArray(target)) {
            return prop in target || prop in instance.info;
        }

        return prop in instance.info || prop in target.data;
    },

    ownKeys: target => {
        if (Array.isArray(target)) {
            return Reflect.ownKeys(target);
        }

        return target.data ? Reflect.ownKeys(target.data) : [];
    },

    getOwnPropertyDescriptor: (target, prop) => {
        if (Array.isArray(target)) {
            return Reflect.getOwnPropertyDescriptor(target, prop);
        }

        const dataProp = Reflect.getOwnPropertyDescriptor(target.data, prop);

        if (dataProp) {
            dataProp.configurable = true;
        }

        return dataProp;
    }
});

export default ResultProxyHandler;
