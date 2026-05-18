const dataProps = ["data", "info"],
    infoProps = ["lastID", "changes"],
    passthroughProps = ["toJSON"];

const targetProp = "obj";

const infoDefaults = Object.freeze({
    lastID: 0,
    changes: 0
});

export { dataProps, infoProps, passthroughProps, targetProp, infoDefaults };
