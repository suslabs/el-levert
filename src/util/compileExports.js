import assert from "node:assert/strict";

function compileExports(barrel, nameField = "$name") {
    let obj = {};

    for (const [exportName, _class] of Object.entries(barrel)) {
        const className = _class.name,
            name = _class[nameField];

        assert.equal(exportName, className, `Incorrect export name (${exportName} =/= ${className}).`);
        assert.notEqual(typeof name, "undefined", `Class ${className} doesn't have a ${nameField} field.`);

        obj[name] = _class;
    }

    return obj;
}

export default compileExports;
