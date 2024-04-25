const TagFlags = {
    new: 1,
    script: 1 << 1,
    vm2: 1 << 2
};

const defaultType = "text",
    defaultScriptType = "ivm",
    specialScriptTypes = ["vm2"];

const scriptTypes = [defaultScriptType].concat(specialScriptTypes);

const versionTypes = ["old", "new"];

const TagTypes = {
    defaultType,
    defaultScriptType,
    specialScriptTypes,
    scriptTypes,
    versionTypes
};

export { TagFlags, TagTypes };
