import TextLoader from "../TextLoader.js";

import ObjectUtil from "../../util/ObjectUtil.js";

class PromptFileLoader extends TextLoader {
    constructor(filePath, logger, options) {
        options = ObjectUtil.guaranteeObject(options);

        super("prompt", filePath, logger, {
            throwOnFailure: true,
            ...options,
            type: null
        });
    }

    getLoadedMessage() {
        return `Loaded ${this.getName()}: ${this.filename}`;
    }
}

export default PromptFileLoader;
