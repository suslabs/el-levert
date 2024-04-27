import util from "node:util";

import { infoProps, infoDefault } from "./ResultProperties.js";

class ProxiedResult {
    constructor() {
        Object.defineProperties(this, {
            data: {
                configurable: true,
                value: undefined
            },
            info: {
                configurable: true,
                value: {}
            }
        });

        this.setInfo();
    }

    setInfo(info) {
        for (const prop of infoProps) {
            if (typeof info === "undefined") {
                this.info[prop] = infoDefault;
            } else {
                this.info[prop] = info[prop] ?? infoDefault;
            }
        }
    }

    setData(data) {
        Object.defineProperty(this, "data", {
            configurable: true,
            value: data
        });
    }

    toJSON(space, replacer) {
        const data = this._data ?? this.data;

        return JSON.stringify(data, space, replacer);
    }

    [util.inspect.custom](depth, options) {
        const obj = {
            data: this._data ?? this.data,
            info: this._info ?? this.info
        };

        Object.defineProperty(obj, Symbol.toStringTag, {
            get: _ => (this._obj ?? this).constructor.name
        });

        return util.inspect(obj, options, depth);
    }
}

export default ProxiedResult;
