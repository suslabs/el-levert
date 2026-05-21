import VMFunction from "../../../structures/vm/VMFunction.js";

import TypeTester from "../../../util/TypeTester.js";

import VMError from "../../../errors/VMError.js";

class ContextFunctions {
    static fromMaps(objMap, names) {
        const functions = Object.entries(objMap).flatMap(([objKey, funcMap]) => {
            if (!TypeTester.isObject(funcMap)) {
                throw new VMError("Invalid object map");
            }

            const objName = names.global[objKey],
                funcNames = names.func[objKey];

            if (typeof objName === "undefined") {
                throw new VMError(`Name for object "${objKey}" not found`, objKey);
            }

            return Object.entries(funcMap).map(([funcKey, props]) => {
                const funcName = funcNames[funcKey];

                if (typeof funcName === "undefined") {
                    throw new VMError(`Name for function "${funcKey}" not found`, funcKey);
                }

                return new VMFunction({
                    singleContext: false,
                    parent: objName,
                    name: funcName,
                    ...props
                });
            });
        });

        return new ContextFunctions(functions);
    }

    constructor(functions) {
        this.functions = functions;
    }

    async register(context, propertyMap) {
        await Promise.all(this.functions.map(func => func.register(context, propertyMap)));
    }
}

export default ContextFunctions;
