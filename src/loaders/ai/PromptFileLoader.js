import TextLoader from "../TextLoader.js";

import ObjectUtil from "../../util/ObjectUtil.js";
import RegexUtil from "../../util/misc/RegexUtil.js";

class PromptFileLoader extends TextLoader {
    constructor(filePath, logger, options) {
        options = ObjectUtil.guaranteeObject(options);

        super("prompt", filePath, logger, {
            throwOnFailure: true,
            ...options,
            type: null
        });

        const variables = options.variables ?? options.parent?.variables;
        this._variables = ObjectUtil.guaranteeObject(variables);
    }

    getLoadedMessage() {
        return `Loaded ${this.getName()}: ${this.filename}`;
    }

    _handleLoadSuccess(data) {
        return super._handleLoadSuccess(RegexUtil.templateReplace(data, this._variables));
    }
}

export default PromptFileLoader;
