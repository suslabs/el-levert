import { VMLanguages } from "../vm/VMLanguages.js";

import Util from "../../util/Util.js";

let TagTypes = {
    flags: {
        new: {
            bit: 0,
            accessors: "none",
            requires: {}
        },
        script: {
            bit: 1,
            accessors: "read",
            requires: {}
        },
        vm2: {
            bit: 2,
            accessors: "write",
            requires: {
                script: true
            }
        },
        ts: {
            bit: 3,
            accessors: "write",
            requires: {
                script: true
            }
        }
    },

    versions: {
        old: {
            flag: "new",
            value: false
        },
        new: {
            flag: "new",
            value: true
        }
    },

    types: {
        text: {
            script: false
        },
        ivm: {
            script: true
        },
        vm2: {
            script: true,
            flag: "vm2"
        }
    },

    languages: {
        [VMLanguages.js]: {},
        [VMLanguages.ts]: {
            flag: "ts",
            value: true
        }
    },

    defaults: {
        type: "text",
        version: "new",
        scriptType: "ivm",
        language: VMLanguages.js,
        flags: new Map()
    }
};

function addEntries(target) {
    target.entries = Object.entries(target);
    target.names = target.entries.map(([name]) => name);
    return target.entries;
}

function addValidNames(target, key = "") {
    if (Util.empty(key)) {
        target.valid = new Set(target.names);
    } else {
        target[`valid${Util.capitalize(key)}`] = new Set(target[key]);
    }
}

function addFlagMetadata(flags) {
    addEntries(flags);
    addValidNames(flags);

    flags.bits = new Map(flags.entries.map(([name, flag]) => [flag.bit, name]));
}

function addVersionMetadata(versions) {
    addEntries(versions);
    addValidNames(versions);
}

function addTypeMetadata(types, defaults) {
    addEntries(types);
    addValidNames(types);

    types.script = types.entries.filter(([, type]) => type.script).map(([name]) => name);
    types.specialScript = types.script.filter(type => type !== defaults.scriptType);
    addValidNames(types, "script");

    const specialFlags = types.specialScript.map(name => types[name].flag);

    for (const [, type] of types.entries) {
        type.flags = [["script", type.script]];

        if (type.script) {
            for (const flag of specialFlags) {
                type.flags.push([flag, type.flag === flag]);
            }
        }
    }
}

function addLanguageMetadata(languages) {
    addEntries(languages);
    addValidNames(languages);

    languages.flags = languages.entries.map(([, language]) => language.flag).filter(Boolean);

    for (const [, language] of languages.entries) {
        language.flags = [["script", true]];

        if (typeof language.flag !== "undefined") {
            language.flags.push([language.flag, language.value]);
        }
    }

    languages.matches = [...languages.entries].sort(([, a], [, b]) => b.flags.length - a.flags.length);
}

function addDefaultMetadata(defaults, versions, types, languages) {
    const type = types[defaults.type],
        version = versions[defaults.version],
        language = languages[defaults.language];

    defaults.meta = {
        version: defaults.version,
        type: defaults.type,
        language: defaults.language
    };

    const flags = [
        [version.flag, version.value],
        ["script", type.script]
    ];

    if (typeof type.flag !== "undefined") {
        flags.push([type.flag, true]);
    }

    if (typeof language.flag !== "undefined") {
        flags.push([language.flag, language.value]);
    }

    defaults.flags = new Map(flags);
}

addFlagMetadata(TagTypes.flags);
addVersionMetadata(TagTypes.versions);
addTypeMetadata(TagTypes.types, TagTypes.defaults);
addLanguageMetadata(TagTypes.languages);

addDefaultMetadata(TagTypes.defaults, TagTypes.versions, TagTypes.types, TagTypes.languages);

TagTypes = Object.freeze(TagTypes);
export { TagTypes };
