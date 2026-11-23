import AITool from "../AITool.js";

import { getClient } from "../../../LevertClient.js";

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

        const [refreshed] = await DiscordUtil.refreshAttachmentUrls(getClient().client.rest, url);

        if (refreshed === null) {
            throw new AIError("This Discord attachment no longer exists or can't be accessed");
        }

        return refreshed;
    }

    formatHost(value) {
        const url = String(value ?? "");
        return this.formatArg(HTTPUtil.getHost(url) ?? url);
    }
}

export default WebTool;
