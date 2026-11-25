import path from "node:path";

import DirectoryLoader from "../DirectoryLoader.js";
import PromptFileLoader from "./PromptFileLoader.js";

import ObjectUtil from "../../util/ObjectUtil.js";

class PromptLoader extends DirectoryLoader {
    constructor(dirPath, logger, options) {
        options = ObjectUtil.guaranteeObject(options);

        super("prompt", dirPath, logger, {
            throwOnFailure: true,
            ...options,
            dataField: "prompts",
            fileExtension: ".txt",
            fileLoaderClass: PromptFileLoader
        });

        this.variables = ObjectUtil.guaranteeObject(options.variables);
    }

    get prompts() {
        return Object.fromEntries(Array.from(this.data ?? [], ([file, text]) => [path.parse(file).name, text]));
    }
}

export default PromptLoader;
