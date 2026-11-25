import WebTool from "./WebTool.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import ToolParams from "../../../util/ai/ToolParams.js";
import AIUtil from "../../../util/ai/AIUtil.js";

class FetchWebPageTool extends WebTool {
    static info = {
        name: "fetch_web_page",
        emoji: "📄",
        phase: AIPhases.reading,
        description: "Get the readable text of a public web page from search results. Use nextOffset to read further.",
        parameters: ToolParams.object(
            {
                url: ToolParams.string("Absolute http(s) URL."),
                ...ToolParams.page()
            },
            ["url"]
        )
    };

    static quick = true;

    static maxCalls = 5;

    getStatus(args) {
        return `Reading ${this.formatHost(args.url)}`;
    }

    async execute(args, session) {
        const url = await this.resolveUrl(args.url),
            page = await this.manager.pageReader.read(url, session.toolTimeout());

        return { source: url, title: page.title, ...AIUtil.pageText(page.text, args) };
    }
}

export default FetchWebPageTool;
