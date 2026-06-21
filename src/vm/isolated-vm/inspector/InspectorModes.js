const InspectorModes = Object.freeze({
    off: "off",
    console: "console",
    user: "user"
});

const validInspectorModes = new Set(Object.values(InspectorModes));

export { InspectorModes, validInspectorModes };
