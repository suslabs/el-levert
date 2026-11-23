import AITool from "../AITool.js";

import { getClient } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import DiscordUtil from "../../../util/DiscordUtil.js";
import HTTPUtil from "../../../util/vm/HTTPUtil.js";

import AIError from "../../../errors/AIError.js";

class WebTool extends AITool {
    async resolveUrl(value) {
        const url = String(value ?? "");

        if (HTTPUtil.getHost(url) === null) {
            throw new AIError("Only absolute http(s) URLs are supported");
        } else if (!DiscordUtil.isAttachmentUrl(url)) {
            return url;
        }

        const refreshed = await DiscordUtil.refreshAttachmentUrls(getClient().client.rest, [url]);
        return Util.first(refreshed);
    }

    formatHost(value) {
        const url = String(value ?? "");
        return this.formatArg(HTTPUtil.getHost(url) ?? url);
    }
}

export default WebTool;
