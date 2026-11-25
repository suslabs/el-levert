import { Buffer } from "node:buffer";

import AITool from "../AITool.js";

import { getClient } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import ObjectUtil from "../../../util/ObjectUtil.js";
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

    async fetchImage(value, session, options) {
        options = ObjectUtil.guaranteeObject(options);

        const headOnly = options.headOnly ?? false,
            maxContentLength = options.maxContentLength;

        const url = await this.resolveUrl(value);

        const req = {
            url,
            method: headOnly ? "head" : "get",
            timeout: session.toolTimeout()
        };

        if (!headOnly) {
            req.responseType = "arraybuffer";
        }

        if (maxContentLength != null) {
            req.maxContentLength = maxContentLength;
        }

        const res = await getClient().aiManager.http.request(req),
            mimeType = Util.first(HTTPUtil.getContentType(res.headers).split(";"));

        if (!mimeType.startsWith("image/")) {
            throw new AIError(`URL is not an image (${Util.empty(mimeType) ? "unknown type" : mimeType})`);
        }

        return {
            url,
            mimeType,
            data: headOnly ? null : Buffer.from(res.data)
        };
    }

    formatHost(value) {
        const url = String(value ?? "");
        return this.formatArg(HTTPUtil.getHost(url) ?? url);
    }
}

export default WebTool;
