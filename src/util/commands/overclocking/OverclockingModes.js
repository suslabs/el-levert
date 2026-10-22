import createEnum from "../../createEnum.js";

const OverclockingModes = createEnum({
    standard: "standard",
    ebf: "ebf",
    lcr: "lcr",
    ce: "ce",
    macerator: "macerator"
});

export default OverclockingModes;
