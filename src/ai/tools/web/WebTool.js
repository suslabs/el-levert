import { Buffer } from "node:buffer";
import path from "node:path";

import AITool from "../AITool.js";

import { getClient } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import ObjectUtil from "../../../util/ObjectUtil.js";
import DiscordUtil from "../../../util/DiscordUtil.js";
import { isSuccessStatus } from "../../../util/misc/HttpStatusCodes.js";
import HTTPUtil from "../../../util/vm/HTTPUtil.js";

import AIError from "../../../errors/AIError.js";

function detectImageMimeType(buf) {
    if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
        return "image/png";
    } else if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
        return "image/jpeg";
    } else if (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "GIF8") {
        return "image/gif";
    } else if (
        buf.length >= 12 &&
        buf.subarray(0, 4).toString("ascii") === "RIFF" &&
        buf.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
        return "image/webp";
    }

    return "";
}

function getMimeType(headers, data) {
    const raw = Util.first(HTTPUtil.getContentType(headers).split(";")).trim();

    if (raw.startsWith("image/")) {
        return raw;
    }

    if (data !== null && (Util.empty(raw) || raw === "application/octet-stream" || raw === "binary/octet-stream")) {
        return detectImageMimeType(data);
    }

    return raw;
}

class WebTool extends AITool {
    static maxImageSize = 8 * Util.dataBytes.megabyte;

    static imageHeaders = Object.freeze({
        accept: "image/*,*/*;q=0.8",
        "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    });

    static imageExtensions = Object.freeze({
        jpeg: "jpg",
        "svg+xml": "svg",
        "x-icon": "ico"
    });

    static defaultImageName = "image";
    static maxImageNameLength = 48;

    static getImageFileName(url, mimeType, preferredName, existingFiles = null) {
        let base = WebTool._sanitizeImageBase(preferredName);

        if (Util.empty(base)) {
            base = WebTool._sanitizeImageBase(WebTool._basenameFromUrl(url));
        }

        if (Util.empty(base)) {
            base = WebTool.defaultImageName;
        }

        const ext = WebTool._getImageExtension(mimeType);
        let name = `${base}.${ext}`;

        for (let i = 2; existingFiles !== null && existingFiles.has(name); i++) {
            name = `${base}-${i}.${ext}`;
        }

        return name;
    }

    async resolveUrl(value) {
        const url = DiscordUtil.normalizeAttachmentUrl(String(value ?? ""));

        if (HTTPUtil.getHost(url) === null) {
            throw new AIError("Only absolute http(s) URLs are supported");
        } else if (!DiscordUtil.isAttachmentUrl(url)) {
            return url;
        }

        let refreshed;

        try {
            [refreshed] = await DiscordUtil.refreshAttachmentUrls(getClient().client.rest, url);
        } catch (err) {
            throw new AIError(`Failed to refresh Discord attachment: ${err.message}`);
        }

        if (refreshed === null) {
            throw new AIError("This Discord attachment no longer exists or can't be accessed");
        }

        return refreshed;
    }

    async fetchImage(value, session, options) {
        options = ObjectUtil.guaranteeObject(options);

        const headOnly = options.headOnly ?? false,
            maxContentLength = options.maxContentLength ?? WebTool.maxImageSize;

        const url = await this.resolveUrl(value),
            timeout = session.toolTimeout();

        let method = headOnly ? "head" : "get",
            res = await this._requestImage(url, method, timeout, maxContentLength);

        if (
            headOnly &&
            (res === null || !isSuccessStatus(res.status) || !HTTPUtil.getContentType(res.headers).startsWith("image/"))
        ) {
            const getRes = await this._requestImage(url, "get", timeout, maxContentLength);

            if (getRes !== null && isSuccessStatus(getRes.status)) {
                method = "get";
                res = getRes;
            } else if (res === null) {
                res = getRes;
            }
        }

        if (res === null) {
            throw new AIError("Failed to fetch image");
        } else if (!isSuccessStatus(res.status)) {
            throw new AIError(`HTTP ${res.status}`, res.status);
        }

        const data = method === "head" ? null : Buffer.from(res.data),
            mimeType = getMimeType(res.headers, data);

        if (!mimeType.startsWith("image/")) {
            throw new AIError(`URL is not an image (${Util.empty(mimeType) ? "unknown type" : mimeType})`);
        }

        return {
            url,
            mimeType,
            data
        };
    }

    formatHost(value) {
        const url = String(value ?? "");
        return this.formatArg(HTTPUtil.getHost(url) ?? url);
    }

    static _invalidImageNameRegex = /[^\w-]+/g;
    static _imageExtensionRegex = /\.[^.]*$/;

    static _sanitizeImageBase(value) {
        return String(value ?? "")
            .trim()
            .replace(WebTool._imageExtensionRegex, "")
            .replace(WebTool._invalidImageNameRegex, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, WebTool.maxImageNameLength);
    }

    static _basenameFromUrl(value) {
        try {
            return decodeURIComponent(path.posix.basename(new URL(value).pathname));
        } catch {
            return "";
        }
    }

    static _getImageExtension(mimeType) {
        const subtype = mimeType.slice("image/".length);
        return WebTool.imageExtensions[subtype] ?? subtype;
    }

    async _requestImage(url, method, timeout, maxContentLength) {
        const req = {
            url,
            method,
            headers: WebTool.imageHeaders,
            timeout,
            validateStatus: () => true
        };

        if (method !== "head") {
            req.responseType = "arraybuffer";

            if (maxContentLength != null) {
                req.maxContentLength = maxContentLength;
            }
        }

        try {
            return await getClient().aiManager.http.request(req);
        } catch (err) {
            if (method === "head") {
                return null;
            }

            throw err;
        }
    }
}

export default WebTool;
