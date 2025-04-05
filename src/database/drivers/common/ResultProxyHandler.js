/* eslint-disable no-fallthrough */
import { dataProps, infoProps, passthroughProps, targetProp } from "./ResultProperties.js";

import Util from "../../../util/Util.js";

const ResultProxyHandler = Object.freeze({
    get: (target, prop) => {
        if (passthroughProps.includes(prop)) {
            return target[prop];
        }

        switch (typeof prop) {
            case "symbol":
                return target[prop];
            case "string":
                if (prop.startsWith("_")) {
                    const privProp = Util.after(prop);

                    if (privProp === targetProp) {
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
                if (target.data == null) {
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
                    const privProp = Util.after(prop);

                    if (privProp === targetProp || dataProps.includes(privProp)) {
                        return false;
                    }
                }

                if (infoProps.includes(prop)) {
                    return false;
                }
            default:
                target.data[prop] = newVal;
                return true;
        }
    },

    has: (target, prop) => {
        if (typeof prop === "symbol" || passthroughProps.includes(prop)) {
            return prop in target;
        }

        return prop in target.info || prop in target.data;
    },

    ownKeys: target => {
        if (target.data == null) {
            return [];
        }

        return Reflect.ownKeys(target.data);
    },

    getOwnPropertyDescriptor: (target, prop) => {
        const dataProp = Reflect.getOwnPropertyDescriptor(target.data, prop);
        dataProp.configurable = true;

        return dataProp;
    }
});

export default ResultProxyHandler;
