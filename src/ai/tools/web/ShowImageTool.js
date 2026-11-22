import WebTool from "./WebTool.js";
import ToolParams from "../ToolParams.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import HTTPUtil from "../../../util/vm/HTTPUtil.js";

import AIError from "../../../errors/AIError.js";

class ShowImageTool extends WebTool {
    static info = {
        name: "show_image",
        phase: AIPhases.looking,
        description:
            "Show an image in your answer's embed, from a direct image URL (a found page's image, an attachment, a diagram). Only one image is shown; a later call replaces it.",
        parameters: ToolParams.object({ url: ToolParams.string("Direct http(s) image URL.") }, ["url"])
    };

    getStatus(args) {
        return `Adding an image from ${this.formatHost(args.url)}`;
    }

    async execute(args, session) {
        const url = this.parseUrl(args.url);

        const res = await this.manager.http.request({
            url,
            method: "head",
            timeout: session.toolTimeout()
        });

        if (!HTTPUtil.getContentType(res.headers).startsWith("image/")) {
            throw new AIError("URL is not an image");
        }

        session.image = url;
        return { shown: true };
    }
}

export default ShowImageTool;
