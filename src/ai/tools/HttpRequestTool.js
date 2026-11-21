import AITool from "./AITool.js";
import ToolParams from "./ToolParams.js";

import Util from "../../util/Util.js";
import HttpUtil from "../../util/misc/HttpUtil.js";

class HttpRequestTool extends AITool {
    static methods = ["GET", "HEAD"];

    static info = {
        name: "http_request",
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

    async execute(args, session) {
        const url = String(args.url ?? ""),
            host = HttpUtil.getHost(url);

        const method = String(args.method ?? "GET").toUpperCase();

        if (!HttpRequestTool.methods.includes(method)) {
            return { error: `${method} requests aren't allowed; only ${HttpRequestTool.methods.join(" and ")}.` };
        } else if (host === null) {
            return { error: "Only absolute http(s) URLs are supported." };
        } else if (host === HttpUtil.getHost(this.manager.gemini.endpoint)) {
            return { error: "That endpoint is reserved." };
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

        const contentType = HttpUtil.getContentType(res.headers);

        if (contentType.includes("text/html")) {
            return {
                status: res.status,
                error: "This URL returned an HTML web page. http_request is for APIs only; use fetch_web_page."
            };
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
