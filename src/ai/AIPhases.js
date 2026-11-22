import createEnum from "../util/createEnum.js";

const AIPhases = createEnum({
    thinking: "Thinking",
    searching: "Searching",
    reading: "Reading",
    running: "Running",
    calculating: "Calculating",
    looking: "Looking",
    fetching: "Fetching"
});

export default AIPhases;
