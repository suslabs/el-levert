import WebTool from "./WebTool.js";
import ToolParams from "../ToolParams.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import Util from "../../../util/Util.js";
import HTTPUtil from "../../../util/vm/HTTPUtil.js";

import AIError from "../../../errors/AIError.js";

class AttachImageTool extends WebTool {
    static info = {
        name: "attach_image",
        phase: AIPhases.fetching,
        description:
            "Download an image from a direct URL and attach it to your answer as a file, for when the user wants the image itself or it must not depend on the link staying up.",
        parameters: ToolParams.object(
            {
                url: ToolParams.string("Direct http(s) image URL."),
                name: ToolParams.string('File name without extension, e.g. "steel_ingot".')
            },
            ["url"]
        )
    };

    static maxSize = 8 * Util.dataBytes.megabyte;

    static defaultName = "image";
    static maxNameLength = 48;

    static extensions = {
        jpeg: "jpg",
        "svg+xml": "svg"
    };

    getStatus(args) {
        return `Attaching an image from ${this.formatHost(args.url)}`;
    }

    async execute(args, session) {
        const url = this.parseUrl(args.url);

        const res = await this.manager.http.request({
            url,
            responseType: "arraybuffer",
            maxContentLength: AttachImageTool.maxSize,
            timeout: session.toolTimeout()
        });

        const mimeType = Util.first(HTTPUtil.getContentType(res.headers).split(";"));

        if (!mimeType.startsWith("image/")) {
            throw new AIError("URL is not an image");
        }

        const name = `${AttachImageTool._getBaseName(args.name)}.${AttachImageTool._getExtension(mimeType)}`;

        session.attachFile(name, Buffer.from(res.data));
        return { attached: name };
    }

    static _invalidNameRegex = /[^\w-]+/g;
    static _extensionRegex = /\.[^.]*$/;

    static _getBaseName(name) {
        const base = String(name ?? "")
            .trim()
            .replace(AttachImageTool._extensionRegex, "")
            .replace(AttachImageTool._invalidNameRegex, "_")
            .slice(0, AttachImageTool.maxNameLength);

        return Util.empty(base) ? AttachImageTool.defaultName : base;
    }

    static _getExtension(mimeType) {
        const subtype = mimeType.slice("image/".length);
        return AttachImageTool.extensions[subtype] ?? subtype;
    }
}

export default AttachImageTool;
