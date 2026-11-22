import WebTool from "./WebTool.js";
import ToolParams from "../ToolParams.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import Util from "../../../util/Util.js";
import HTTPUtil from "../../../util/vm/HTTPUtil.js";

import AIError from "../../../errors/AIError.js";

class HttpRequestTool extends WebTool {
    static methods = ["GET", "HEAD"];

    static info = {
        name: "http_request",
        phase: AIPhases.fetching,
        description:
            "GET/HEAD an API endpoint or user-owned endpoint (JSON/text). NEVER use for public web pages (use fetch_web_page).",
        parameters: ToolParams.object(
            {
                method: ToolParams.string("HTTP method.", { enum: HttpRequestTool.methods }),
                url: ToolParams.string("Absolute API URL."),
                headers: {
                    type: "array",
                    items: ToolParams.object(
                        {
                            name: ToolParams.string("Header name."),
                            value: ToolParams.string("Header value.")
                        },
                        ["name", "value"]
                    ),
                    description: "Request headers."
                }
            },
            ["url"]
        )
    };

    static maxBodyLength = 6000;

    getStatus(args) {
        return `Requesting ${this.formatHost(args.url)}`;
    }

    async execute(args, session) {
        const url = this.parseUrl(args.url),
            method = String(args.method ?? "GET").toUpperCase();

        if (!HttpRequestTool.methods.includes(method)) {
            throw new AIError(`${method} requests aren't allowed; only ${HttpRequestTool.methods.join(" and ")}`);
        } else if (HTTPUtil.getHost(url) === HTTPUtil.getHost(this.manager.gemini.endpoint)) {
            throw new AIError("That endpoint is reserved");
        }

        const res = await this.manager.http.request({
            url,
            method: method.toLowerCase(),
            headers: {
                accept: "application/json, text/plain;q=0.9",
                ...Object.fromEntries((args.headers ?? []).map(header => [header.name, header.value]))
            },
            responseType: "text",
            transformResponse: data => data,
            timeout: session.toolTimeout(),
            validateStatus: () => true
        });

        const contentType = HTTPUtil.getContentType(res.headers);

        if (contentType.includes("text/html")) {
            throw new AIError("This URL returned an HTML web page; use fetch_web_page", res.status);
        }

        return {
            source: url,
            status: res.status,
            contentType,
            body: this._parseBody(String(res.data ?? ""), contentType)
        };
    }

    _parseBody(text, contentType) {
        if (text.length > HttpRequestTool.maxBodyLength || !contentType.includes("json")) {
            return Util.trimString(text, HttpRequestTool.maxBodyLength);
        }

        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }
}

export default HttpRequestTool;
