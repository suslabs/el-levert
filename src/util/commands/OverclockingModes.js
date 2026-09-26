const OverclockingModes = Object.freeze({
    standard: "standard",
    ebf: "ebf",
    lcr: "lcr",
    ce: "ce",
    macerator: "macerator"
});

const modeNames = Object.freeze(Object.values(OverclockingModes));

const validModes = new Set(modeNames);

export { modeNames, validModes };
export default OverclockingModes;
