import WebTool from "./WebTool.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import ToolParams from "../../../util/ai/ToolParams.js";

class ShowImageTool extends WebTool {
    static info = {
        name: "show_image",
        emoji: "🏞️",
        phase: AIPhases.looking,
        description:
            "Show an image inside your answer's embed from a direct image URL (a web search result's image, an attachment, a diagram). Up to 4 images are shown as a grid.",
        parameters: ToolParams.object(
            {
                url: ToolParams.string("Direct http(s) image URL."),
                attach: ToolParams.boolean(
                    "Download and upload the image as an attachment for the embed (useful when a host may block external proxies)."
                )
            },
            ["url"]
        )
    };

    getStatus(args) {
        return `Adding an image from ${this.formatHost(args.url)}`;
    }

    async execute(args, session) {
        const shouldAttach = args.attach === true,
            { url, mimeType, data } = await this.fetchImage(args.url, session, {
                headOnly: !shouldAttach,
                maxContentLength: WebTool.maxImageSize
            });

        if (data !== null) {
            const name = WebTool.getImageFileName(url, mimeType, null, session.files);

            session.attachFile(name, data);
            session.showImage(`attachment://${name}`);

            return { shown: true, attached: name };
        }

        session.showImage(url);
        return { shown: true };
    }
}

export default ShowImageTool;
