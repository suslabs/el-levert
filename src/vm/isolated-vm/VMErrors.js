import ManevraError from "./functionErrors/ManevraError.js";

import TypeTester from "../../util/TypeTester.js";

const VMErrors = Object.freeze({
    timeout: {
        in: "Script execution timed out.",
        out: "Script execution timed out"
    },

    memLimit: {
        in: "Isolate was disposed during execution due to memory limit",
        out: "Memory limit reached"
    },

    custom: ["ExitError", TypeTester.className(ManevraError)]
});

export default VMErrors;
