import AITool from "../AITool.js";
import ToolParams from "../ToolParams.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import Util from "../../../util/Util.js";
import HtmlUtil from "../../../util/misc/HtmlUtil.js";
import HTTPUtil from "../../../util/vm/HTTPUtil.js";
import { isSuccessStatus } from "../../../util/misc/HttpStatusCodes.js";

class FetchWebPageTool extends AITool {
    static info = {
        name: "fetch_web_page",
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
        return `Reading ${this.formatArg(HTTPUtil.getHost(String(args.url ?? "")) ?? args.url)}`;
    }

    async execute(args, session) {
        const url = String(args.url ?? "");

        if (HTTPUtil.getHost(url) === null) {
            return { error: "Only absolute http(s) URLs are supported." };
        }

        const wiki = url.match(FetchWebPageTool._wikipediaRegex),
            page = wiki === null ? await this._fetchPage(url, session) : await this._fetchWikipedia(wiki, session);

        if (typeof page.error !== "undefined") {
            return { url, ...page };
        }

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
            url: `https://${lang}.wikipedia.org/w/api.php`,
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
            return { error: "Wikipedia page not found." };
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
            return { status: res.status, error: `HTTP ${res.status}` };
        }

        const contentType = HTTPUtil.getContentType(res.headers);

        if (contentType.startsWith("image/")) {
            return { error: "This URL is an image; use inspect_image." };
        } else if (contentType.includes("html")) {
            return HtmlUtil.toText(res.data);
        } else {
            return { title: "", text: String(res.data) };
        }
    }
}

export default FetchWebPageTool;
