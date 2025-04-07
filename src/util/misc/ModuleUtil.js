import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

import TypeTester from "../TypeTester.js";

const ModuleUtil = Object.freeze({
    import: async (modulePath, cache = true) => {
        let fileURL = pathToFileURL(modulePath);

        if (!cache) {
            fileURL += `?update=${Date.now()}`;
        }

        return (await import(fileURL)).default;
    },

    compileExports: (barrel, nameField = "$name") => {
        let obj = {},
            i = 1;

        for (const [exportName, _class] of Object.entries(barrel)) {
            const info = [nameField, exportName];

            if (TypeTester.isPromise(_class)) {
                const name = `dummy${i}`;
                obj[name] = ModuleUtil._resolveFunc.bind(obj, name, _class, info);

                i++;
            } else {
                const name = ModuleUtil._checkClass(_class, info);

                if (name !== null) {
                    obj[name] = _class;
                }
            }
        }

        return obj;
    },

    loadOptionalModule: async (dependencyName, importURL, modulePath) => {
        try {
            await import(dependencyName);
        } catch (err) {
            console.warn(`Optional dependency "${dependencyName}" is not installed. Skipping "${modulePath}".`);
            return null;
        }

        const resolvedModulePath = new URL(modulePath, importURL).href;
        return (await import(resolvedModulePath)).default;
    },

    resolveBarrel: async barrel => {
        for (const name of Object.keys(barrel)) {
            const _class = barrel[name];

            if (name.startsWith("dummy")) {
                await _class();
            }
        }
    },

    _checkClass: (_class, info) => {
        if (typeof _class !== "function") {
            return null;
        }

        const [nameField, exportName] = info;

        const className = _class.name,
            name = _class[nameField];

        assert.equal(exportName, className, `Mismatched export name. (${exportName} =/= ${className})`);
        assert.notEqual(typeof name, "undefined", `Class ${className} doesn't have a ${nameField} field.`);

        return name;
    },

    _resolveFunc: async function (name, _class, info) {
        delete this[name];
        const new_class = await _class;

        const newName = ModuleUtil._checkClass(new_class, info);

        if (newName !== null) {
            this[newName] = new_class;
        }
    }
});

export default ModuleUtil;
