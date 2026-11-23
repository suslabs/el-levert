import path from "node:path";

import DirectoryLoader from "../DirectoryLoader.js";
import PromptFileLoader from "./PromptFileLoader.js";

import ObjectUtil from "../../util/ObjectUtil.js";

import { LoadStatus } from "../LoadStatus.js";

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

        this.prompts = {};
    }

    async load() {
        const status = await super.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        this.prompts = Object.fromEntries(Array.from(this.data, ([file, text]) => [path.parse(file).name, text]));
        return status;
    }
}

export default PromptLoader;
