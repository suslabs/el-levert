import createEnum from "../util/createEnum.js";

const AIStepStatus = createEnum({
    running: "running",
    done: "done",
    failed: "failed"
});

export default AIStepStatus;
