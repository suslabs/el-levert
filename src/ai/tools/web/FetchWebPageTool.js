import WebTool from "./WebTool.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import HTMLUtil from "../../../util/misc/HTMLUtil.js";
import HTTPUtil from "../../../util/vm/HTTPUtil.js";
import { isSuccessStatus } from "../../../util/misc/HttpStatusCodes.js";
import ToolParams from "../../../util/ai/ToolParams.js";
import AIUtil from "../../../util/ai/AIUtil.js";

import AIError from "../../../errors/AIError.js";

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

    getStatus(args) {
        return `Reading ${this.formatHost(args.url)}`;
    }

    async execute(args, session) {
        const url = await this.resolveUrl(args.url),
            page = await this._fetchPage(url, session);

        return { source: url, title: page.title, ...AIUtil.pageText(page.text, args) };
    }

    async _fetchPage(url, session) {
        const res = await this.manager.http.request({
            url,
            headers: { accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.5" },
            responseType: "text",
            timeout: session.toolTimeout(),
            validateStatus: () => true
        });

        if (!isSuccessStatus(res.status)) {
            throw new AIError(`HTTP ${res.status}`, res.status);
        }

        const contentType = HTTPUtil.getContentType(res.headers);

        if (contentType.startsWith("image/")) {
            throw new AIError("This URL is an image; use inspect_image");
        } else if (contentType.includes("html")) {
            return HTMLUtil.toText(res.data);
        } else {
            return { title: "", text: String(res.data) };
        }
    }
}

export default FetchWebPageTool;
