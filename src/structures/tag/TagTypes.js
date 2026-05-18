import TagBitField from "./TagBitField.js";

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
            script: false,
            flags: {}
        },
        ivm: {
            script: true,
            flags: {
                script: true
            }
        },
        vm2: {
            script: true,
            flags: {
                script: true,
                vm2: true
            }
        }
    },

    defaults: {
        type: "text",
        version: "new",
        scriptType: "ivm"
    }
};

function addEntries(target) {
    target.entries = Object.entries(target);
    target.names = target.entries.map(([name]) => name);
    return target.entries;
}

function addAccessGroups(flags) {
    flags.readonly = [];
    flags.writable = [];

    for (const [name, config] of flags.entries) {
        if (config.accessors === "read") {
            flags.readonly.push(name);
        } else if (config.accessors === "write") {
            flags.writable.push(name);
        }
    }
}

function addFlagMetadata(flags) {
    addEntries(flags);

    flags.bits = {};
    flags.requires = {};
    flags.dependents = Object.fromEntries(flags.names.map(name => [name, []]));

    for (const [name, config] of flags.entries) {
        flags.bits[name] = config.bit;
        flags.requires[name] = Object.entries(config.requires).map(([requiredName, value]) => ({
            name: requiredName,
            value
        }));

        for (const required of flags.requires[name]) {
            flags.dependents[required.name]?.push({
                name,
                value: required.value
            });
        }
    }

    flags.clearedDependents = Object.fromEntries(
        flags.names.map(name => [
            name,
            {
                false: flags.dependents[name].filter(({ value }) => value !== false).map(({ name }) => name),
                true: flags.dependents[name].filter(({ value }) => value !== true).map(({ name }) => name)
            }
        ])
    );

    for (const [name, config] of flags.entries) {
        config.requiredFlags = flags.requires[name];
        config.clearedDependents = flags.clearedDependents[name];
    }

    addAccessGroups(flags);
}

function addVersionMetadata(versions) {
    addEntries(versions);
    versions.valid = new Set(versions.names);
}

function addTypeMetadata(types, defaults) {
    addEntries(types);
    types.script = types.entries.filter(([, config]) => config.script).map(([name]) => name);
    types.validScript = new Set(types.script);
    types.specialScript = types.script.filter(type => type !== defaults.scriptType);
}

addFlagMetadata(TagTypes.flags);
addVersionMetadata(TagTypes.versions);
addTypeMetadata(TagTypes.types, TagTypes.defaults);

TagBitField.configure(TagTypes);

TagTypes = Object.freeze(TagTypes);
export { TagTypes };
