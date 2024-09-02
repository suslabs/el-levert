import assert from "node:assert/strict";

function compileImports(barrel, nameField = "name") {
    let obj = {};

    for (const [exportName, _class] of Object.values(barrel)) {
        const className = _class.constructor.name,
            name = _class[nameField];

        assert.equal(exportName, className, "Incorrect export name");
        obj[name] = _class;
    }

    return obj;
}

export default compileImports;
