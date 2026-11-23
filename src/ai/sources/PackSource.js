import PackModes from "../../structures/ai/PackModes.js";

class PackSource {
    constructor(http, options) {
        this.http = http;
        this.mode = options.mode;
    }

    getMode(expert) {
        return expert ? PackModes.expert : this.mode;
    }
}

export default PackSource;
