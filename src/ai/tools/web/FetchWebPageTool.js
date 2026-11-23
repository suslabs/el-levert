import WebTool from "./WebTool.js";
import ToolParams from "../ToolParams.js";
import WebSearcher from "../../WebSearcher.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import Util from "../../../util/Util.js";
import HtmlUtil from "../../../util/misc/HtmlUtil.js";
import HTTPUtil from "../../../util/vm/HTTPUtil.js";
import { isSuccessStatus } from "../../../util/misc/HttpStatusCodes.js";

import AIError from "../../../errors/AIError.js";

class FetchWebPageTool extends WebTool {
    static info = {
        name: "fetch_web_page",
        emoji: "📄",
        phase: AIPhases.reading,
        description:
            "Get the readable text of a public web page (including Wikipedia and search results). Use nextOffset to read further.",
        parameters: ToolParams.object(
            {
                url: ToolParams.string("Absolute http(s) URL."),
                offset: ToolParams.integer("Character offset to continue from."),
                maxChars: ToolParams.integer("Characters to return, 500-8000 (default 5000).")
            },
            ["url"]
        )
    };

    static defaultChars = 5000;
    static minChars = 500;
    static maxChars = 8000;

    getStatus(args) {
        return `Reading ${this.formatHost(args.url)}`;
    }

    async execute(args, session) {
        const url = this.parseUrl(args.url);

        const wiki = url.match(FetchWebPageTool._wikipediaRegex),
            page = wiki === null ? await this._fetchPage(url, session) : await this._fetchWikipedia(wiki, session);

        const offset = Math.max(args.offset ?? 0, 0),
            maxChars = Util.clamp(
                args.maxChars ?? FetchWebPageTool.defaultChars,
                FetchWebPageTool.minChars,
                FetchWebPageTool.maxChars
            );

        const end = offset + maxChars;

        return {
            source: url,
            title: page.title,
            text: page.text.slice(offset, end),
            offset,
            nextOffset: end < page.text.length ? end : null,
            totalChars: page.text.length
        };
    }

    static _wikipediaRegex = /^https?:\/\/([a-z-]+)\.(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)/i;

    async _fetchWikipedia(wiki, session) {
        const [, lang, title] = wiki;

        const res = await this.manager.http.request({
            url: WebSearcher.getWikipediaUrl(lang, "w/api.php"),
            params: {
                action: "query",
                prop: "extracts",
                explaintext: 1,
                redirects: 1,
                format: "json",
                titles: decodeURIComponent(title)
            },
            responseType: "json",
            timeout: session.toolTimeout()
        });

        const page = Util.first(Object.values(res.data.query?.pages ?? {}));

        if (typeof page === "undefined" || typeof page.missing !== "undefined") {
            throw new AIError("Wikipedia page not found");
        }

        return { title: page.title, text: page.extract ?? "" };
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
            return HtmlUtil.toText(res.data);
        } else {
            return { title: "", text: String(res.data) };
        }
    }
}

export default FetchWebPageTool;
