import ts from "typescript";

import { VMLanguages, normalizeVMLanguage } from "../../structures/vm/VMLanguages.js";

import ObjectUtil from "../ObjectUtil.js";

function transpileScript(code, options = {}) {
    options = ObjectUtil.guaranteeObject(options);

    const language = normalizeVMLanguage(options.language ?? VMLanguages.js);

    switch (language) {
        case VMLanguages.ts:
            return ts.transpile(code);
        case VMLanguages.js:
        default:
            return code;
    }
}

export { transpileScript };
