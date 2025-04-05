import ManevraError from "./functionErrors/ManevraError.js";

import Util from "../../util/Util.js";

const VMErrors = Object.freeze({
    timeout: "Script execution timed out.",
    memLimit: "Isolate was disposed during execution due to memory limit",

    custom: ["VMError", "ExitError", Util.className(ManevraError)]
});

export default VMErrors;
