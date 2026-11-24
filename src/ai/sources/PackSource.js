import PackModes from "../../structures/PackModes.js";

import ObjectUtil from "../../util/ObjectUtil.js";

class PackSource {
    constructor(http, options) {
        options = ObjectUtil.guaranteeObject(options);

        this.http = http;
        this.mode = options.mode ?? PackModes.normal;
    }

    getMode(expert) {
        return expert ? PackModes.expert : this.mode;
    }
}

export default PackSource;
