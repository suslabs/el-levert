import ManevraError from "./functionErrors/ManevraError.js";

import TypeTester from "../../util/TypeTester.js";

const VMErrors = Object.freeze({
    timeout: "Script execution timed out.",
    memLimit: "Isolate was disposed during execution due to memory limit",

    custom: ["VMError", "ExitError", TypeTester.className(ManevraError)]
});

export default VMErrors;
