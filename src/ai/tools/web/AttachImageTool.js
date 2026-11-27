import WebTool from "./WebTool.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import ToolParams from "../../../util/ai/ToolParams.js";

class AttachImageTool extends WebTool {
    static info = {
        name: "attach_image",
        emoji: "📎",
        phase: AIPhases.fetching,
        description:
            "Download an image from a direct URL (including web search image URLs or attachments) and attach it to your answer as a file, for when the user wants the image itself or it must not depend on the link staying up.",
        parameters: ToolParams.object(
            {
                url: ToolParams.string("Direct http(s) image URL."),
                name: ToolParams.string('File name without extension, e.g. "steel_ingot".'),
                embed: ToolParams.boolean("Also display the attached image inside the answer embed.")
            },
            ["url"]
        )
    };

    static maxSize = WebTool.maxImageSize;

    getStatus(args) {
        return `Attaching an image from ${this.formatHost(args.url)}`;
    }

    async execute(args, session) {
        const { url, mimeType, data } = await this.fetchImage(args.url, session, {
            maxContentLength: AttachImageTool.maxSize
        });

        const name = WebTool.getImageFileName(url, mimeType, args.name, session.files);

        session.attachFile(name, data);

        if (args.embed === true) {
            session.showImage(`attachment://${name}`);
        }

        return { attached: name };
    }
}

export default AttachImageTool;
