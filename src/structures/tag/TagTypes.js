const TagFlags = {
    new: 1,
    script: 1 << 1,
    vm2: 1 << 2
};

const textType = "text",
    versionTypes = ["old", "new"];

const defaultScriptType = "ivm",
    specialScriptTypes = ["vm2"];

const scriptTypes = [defaultScriptType].concat(specialScriptTypes);

const TagTypes = {
    defaultType: textType,
    defaultVersion: versionTypes[1],
    defaultScriptType,

    textType,
    versionTypes,
    specialScriptTypes,
    scriptTypes
};

export { TagFlags, TagTypes };
