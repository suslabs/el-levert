import RE2 from "re2";

import MessageHistoryTool from "./MessageHistoryTool.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import Util from "../../../util/Util.js";
import RegexUtil from "../../../util/misc/RegexUtil.js";
import ToolParams from "../../../util/ai/ToolParams.js";

import AIError from "../../../errors/AIError.js";

class SearchMessagesTool extends MessageHistoryTool {
    static info = {
        name: "search_messages",
        emoji: "🔍",
        phase: AIPhases.searching,
        description:
            "Search the recent history of one channel (only channels the asking user can see) for actual text. No match-all regex.",
        parameters: ToolParams.object(
            {
                query: ToolParams.string("Case-insensitive text, or a regex if isRegex is true."),
                channelId: ToolParams.string("Channel ID or <#mention>; defaults to the current channel."),
                authorId: ToolParams.string("Only messages by this user ID or mention."),
                isRegex: ToolParams.boolean("Treat query as a regular expression."),
                limit: ToolParams.integer("Max matches, 1-25 (default 10)."),
                scanLimit: ToolParams.integer("Messages to scan, 100-500 (default 300).")
            },
            ["query"]
        )
    };

    static maxCalls = 3;

    static defaultLimit = 10;
    static maxLimit = 25;

    static defaultScan = 300;
    static maxScan = 500;

    getStatus(args) {
        return `Searching messages for "${this.formatArg(args.query)}"`;
    }

    async execute(args, session) {
        const query = String(args.query ?? "");

        if (Util.empty(query.trim())) {
            throw new AIError("query is required. For author/time-only filtering use fetch_recent_messages");
        }

        const matcher = this._createMatcher(query, args.isRegex ?? false);

        const limit = this.getLimit(args),
            scan = Util.clamp(
                args.scanLimit ?? SearchMessagesTool.defaultScan,
                MessageHistoryTool.pageSize,
                SearchMessagesTool.maxScan
            );

        const authorId = this.parseUserId(args.authorId);

        const msgs = await this.fetchHistory(session, {
            channelId: args.channelId,
            pages: Math.ceil(scan / MessageHistoryTool.pageSize),
            pageSize: MessageHistoryTool.pageSize
        });

        const matches = msgs
            .filter(msg => authorId === null || msg.author.id === authorId)
            .filter(msg => matcher.test(this._getSearchText(msg)))
            .slice(0, limit);

        const out = {
            scanned: msgs.length,
            count: matches.length,
            messages: matches.map(msg => this.formatMessage(msg))
        };

        if (Util.empty(matches)) {
            out.note = `No messages matching "${query}" in the last ${msgs.length} messages.`;
        }

        return out;
    }

    _createMatcher(query, isRegex) {
        let regex;

        try {
            regex = new RE2(isRegex ? query : RegexUtil.escapeRegex(query), "i");
        } catch (err) {
            throw new AIError(`Invalid regex: ${err.message}`);
        }

        if (regex.test("") || regex.test(" ")) {
            throw new AIError("Match-all regex isn't allowed; use a real text query");
        }

        return regex;
    }

    _getSearchText(msg) {
        const embedText = msg.embeds.map(embed => `${embed.title ?? ""} ${embed.description ?? ""}`);
        return [msg.content, ...embedText].join(" ");
    }
}

export default SearchMessagesTool;
