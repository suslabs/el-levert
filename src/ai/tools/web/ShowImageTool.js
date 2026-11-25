import WebTool from "./WebTool.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import ToolParams from "../../../util/ai/ToolParams.js";

class ShowImageTool extends WebTool {
    static info = {
        name: "show_image",
        emoji: "🏞️",
        phase: AIPhases.looking,
        description:
            "Show an image inside your answer's embed from a direct image URL (a found page's image, an attachment, a diagram). Up to 4 images are shown as a grid.",
        parameters: ToolParams.object({ url: ToolParams.string("Direct http(s) image URL.") }, ["url"])
    };

    getStatus(args) {
        return `Adding an image from ${this.formatHost(args.url)}`;
    }

    async execute(args, session) {
        const { url } = await this.fetchImage(args.url, session, { headOnly: true });

        session.showImage(url);
        return { shown: true };
    }
}

export default ShowImageTool;
