import AITool from "../AITool.js";

import HTTPUtil from "../../../util/vm/HTTPUtil.js";

import AIError from "../../../errors/AIError.js";

class WebTool extends AITool {
    parseUrl(value) {
        const url = String(value ?? "");

        if (HTTPUtil.getHost(url) === null) {
            throw new AIError("Only absolute http(s) URLs are supported");
        }

        return url;
    }

    formatHost(value) {
        const url = String(value ?? "");
        return this.formatArg(HTTPUtil.getHost(url) ?? url);
    }
}

export default WebTool;
