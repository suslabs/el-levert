import createEnum from "../../util/createEnum.js";
import TypeTester from "../../util/TypeTester.js";

import UtilError from "../../errors/UtilError.js";

const VMLanguages = createEnum({
    js: "js",
    ts: "ts"
});

function resolveVMLanguage(language, fallback = null) {
    language = String(language ?? "")
        .trim()
        .toLowerCase();

    switch (language) {
        case VMLanguages.js:
        case VMLanguages.ts:
            return language;
        case "javascript":
            return VMLanguages.js;
        case "typescript":
            return VMLanguages.ts;
        default:
            return fallback;
    }
}

function normalizeVMLanguage(language) {
    return TypeTester.normalizeEnum(language, VMLanguages, "language", UtilError, {
        normalize: resolveVMLanguage,
        unknown: "Unsupported script"
    });
}

export { VMLanguages, resolveVMLanguage, normalizeVMLanguage };
