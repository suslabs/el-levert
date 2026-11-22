import MessageHistoryTool from "./MessageHistoryTool.js";
import ToolParams from "../ToolParams.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import Util from "../../../util/Util.js";

class FetchRecentMessagesTool extends MessageHistoryTool {
    static info = {
        name: "fetch_recent_messages",
        phase: AIPhases.reading,
        description:
            "Read recent chat history (only channels the asking user can see), optionally filtered by author or time. Use this for author/time-only filtering.",
        parameters: ToolParams.object({
            channelId: ToolParams.string("Channel ID or <#mention>; defaults to the current channel."),
            limit: ToolParams.integer("Messages to return, 1-100 (default 20)."),
            authorId: ToolParams.string("Only messages by this user ID or mention."),
            before: ToolParams.string("Only messages before this message ID."),
            since: ToolParams.string("ISO date/time lower bound."),
            until: ToolParams.string("ISO date/time upper bound."),
            includeBots: ToolParams.boolean("Include bot messages (default true).")
        })
    };

    static defaultLimit = 20;
    static filteredPages = 3;

    getStatus() {
        return "Reading recent messages";
    }

    async execute(args, session) {
        const limit = Util.clamp(args.limit ?? FetchRecentMessagesTool.defaultLimit, 1, MessageHistoryTool.pageSize);

        const authorId = this.parseUserId(args.authorId),
            includeBots = args.includeBots ?? true;

        const since = Date.parse(args.since ?? ""),
            until = Date.parse(args.until ?? "");

        const filtered = authorId !== null || Number.isFinite(since) || Number.isFinite(until) || !includeBots;

        const msgs = await this.fetchHistory(session, {
            channelId: args.channelId,
            before: args.before,
            pages: filtered ? FetchRecentMessagesTool.filteredPages : 1,
            pageSize: filtered ? MessageHistoryTool.pageSize : limit
        });

        const matches = msgs
            .filter(msg => !Number.isFinite(since) || msg.createdTimestamp >= since)
            .filter(msg => !Number.isFinite(until) || msg.createdTimestamp <= until)
            .filter(msg => authorId === null || msg.author.id === authorId)
            .filter(msg => includeBots || !msg.author.bot)
            .slice(0, limit);

        return {
            scanned: msgs.length,
            count: matches.length,
            messages: matches.reverse().map(msg => this.formatMessage(msg))
        };
    }
}

export default FetchRecentMessagesTool;
