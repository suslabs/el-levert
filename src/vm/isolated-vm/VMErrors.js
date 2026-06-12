import ManevraError from "./functionErrors/ManevraError.js";

import TypeTester from "../../util/TypeTester.js";

let VMErrors = {
    timeout: {
        in: "Script execution timed out.",
        out: "Script execution timed out"
    },

    memLimit: {
        in: "Isolate was disposed during execution due to memory limit",
        out: "Memory limit reached"
    },

    custom: ["ExitError", TypeTester.className(ManevraError)]
};

const vmErrorMessages = new Map(
    Object.entries(VMErrors)
        .filter(([name]) => name !== "custom")
        .map(([, info]) => [info.in, info.out])
);

VMErrors = Object.freeze(VMErrors);
export { VMErrors, vmErrorMessages };
