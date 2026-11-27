import { DiscordAPIError, MessageSearchAuthorType, MessageSearchHasType } from "discord.js";
import RE2 from "re2";

import MessageHistoryTool from "./MessageHistoryTool.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import { getClient } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import DiscordUtil from "../../../util/DiscordUtil.js";
import RegexUtil from "../../../util/misc/RegexUtil.js";
import ToolParams from "../../../util/ai/ToolParams.js";

import AIError from "../../../errors/AIError.js";

const validHasTypes = new Set(Object.values(MessageSearchHasType));

function createMatcher(query, isRegex) {
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

function getSearchText(msg) {
    const embedText = msg.embeds
        .map(embed => DiscordUtil.stringifyEmbed(embed, { urls: false }))
        .filter(Util.nonemptyString);

    return [msg.content, ...embedText].join(" ");
}

function parseDateArg(value, name) {
    if (!Util.nonemptyString(value)) {
        return null;
    }

    const ms = Date.parse(value);

    if (!Number.isFinite(ms)) {
        throw new AIError(`Invalid ${name} date: ${value}`);
    }

    return new Date(Math.max(ms, DiscordUtil.discordEpoch));
}

function parseHasArg(hasList) {
    if (!Array.isArray(hasList) || Util.empty(hasList)) {
        return [];
    }

    return hasList.map(item => String(item).trim().toLowerCase()).filter(item => validHasTypes.has(item));
}

function hasContentMatches(msg, hasTypes) {
    for (const type of hasTypes) {
        switch (type) {
            case MessageSearchHasType.Image:
                if (!msg.attachments?.some(attach => attach.contentType?.startsWith("image/"))) {
                    return false;
                }
                break;
            case MessageSearchHasType.File:
                if ((msg.attachments?.size ?? 0) === 0) {
                    return false;
                }
                break;
            case MessageSearchHasType.Embed:
                if (Util.empty(msg.embeds)) {
                    return false;
                }
                break;
            case MessageSearchHasType.Link:
                if (!String(msg.content ?? "").includes("http")) {
                    return false;
                }
                break;
        }
    }

    return true;
}

class SearchMessagesTool extends MessageHistoryTool {
    static info = {
        name: "search_messages",
        emoji: "🔍",
        phase: AIPhases.searching,
        description:
            "Search server messages with Discord's search API (only channels the asking user can see) across the whole server or one channel, or scan recent DM history when in DMs. Supports text queries and filters (authorId, has, pinned, mentions, since, until). No match-all regex.",
        parameters: ToolParams.object({
            query: ToolParams.string("Search text (or a regex if isRegex is true)."),
            channelId: ToolParams.string("Channel ID or <#mention>; omit to search all accessible server channels."),
            authorId: ToolParams.string("Only messages by this user ID or mention."),
            mentions: ToolParams.string("Only messages mentioning this user ID or mention."),
            has: ToolParams.stringArray(
                "Filter by content type: image, video, file, embed, link, sticker, poll, sound."
            ),
            pinned: ToolParams.boolean("Only pinned (true) or unpinned (false) messages."),
            since: ToolParams.string("ISO date/time lower bound."),
            until: ToolParams.string("ISO date/time upper bound."),
            includeBots: ToolParams.boolean("Include bot messages (default true)."),
            sortBy: ToolParams.string('Sort order mode: "timestamp" (default) or "relevance".', {
                enum: ["timestamp", "relevance"]
            }),
            sortOrder: ToolParams.string('Sort direction: "desc" (newest, default) or "asc" (oldest).', {
                enum: ["desc", "asc"]
            }),
            offset: ToolParams.integer("Result offset for pagination, 0-9975 (default 0)."),
            isRegex: ToolParams.boolean("Treat query as a regex to scan recent history in one channel."),
            limit: ToolParams.integer("Max matches, 1-25 (default 10)."),
            scanLimit: ToolParams.integer(
                "Recent messages to scan when using regex/DM fallback, 100-500 (default 300)."
            )
        })
    };

    static maxCalls = 4;

    static defaultLimit = 10;
    static maxLimit = 25;

    static defaultScan = 300;
    static maxScan = 500;

    getStatus(args) {
        if (Util.nonemptyString(args.query)) {
            return `Searching messages for "${this.formatArg(args.query)}"`;
        }

        return "Searching messages";
    }

    async execute(args, session) {
        const query = String(args.query ?? "").trim(),
            isRegex = args.isRegex ?? false,
            limit = this.getLimit(args),
            authorId = this.parseUserId(args.authorId),
            mentionsId = this.parseUserId(args.mentions),
            includeBots = args.includeBots ?? true,
            hasTypes = parseHasArg(args.has),
            pinned = typeof args.pinned === "boolean" ? args.pinned : null,
            since = parseDateArg(args.since, "since"),
            until = parseDateArg(args.until, "until");

        if (isRegex && Util.empty(query)) {
            throw new AIError("query is required when isRegex is true");
        }

        const hasFilters =
            !Util.empty(query) ||
            authorId !== null ||
            mentionsId !== null ||
            !Util.empty(hasTypes) ||
            pinned !== null ||
            since !== null ||
            until !== null ||
            !includeBots;

        if (!hasFilters) {
            throw new AIError(
                "Provide a search query or at least one filter (authorId, has, pinned, mentions, since, until), or use fetch_recent_messages"
            );
        }

        if (isRegex || session.request.guild === null) {
            return await this._searchHistoryFallback(args, session, {
                query,
                isRegex,
                limit,
                authorId,
                includeBots,
                hasTypes,
                pinned,
                since,
                until
            });
        }

        return await this._searchGuild(args, session, {
            query,
            limit,
            authorId,
            mentionsId,
            includeBots,
            hasTypes,
            pinned,
            since,
            until
        });
    }

    async _searchGuild(args, session, filters) {
        const request = session.request,
            channelId = Util.nonemptyString(args.channelId) ? this.resolveChannelId(args.channelId) : null;

        if (Util.nonemptyString(args.channelId) && channelId === null) {
            throw new AIError("Invalid channelId");
        }

        const searchOptions = {
            checkAccess: true,
            user_id: request.author.id,
            limit: filters.limit,
            offset: args.offset ?? 0,
            sortBy: args.sortBy ?? "timestamp",
            sortOrder: args.sortOrder ?? "desc",
            includeNsfw: request.channel?.nsfw === true
        };

        if (channelId !== null) {
            searchOptions.channelId = channelId;
        }

        if (!Util.empty(filters.query)) {
            searchOptions.content = filters.query;
        }

        if (filters.authorId !== null) {
            searchOptions.authorIds = [filters.authorId];
        } else if (!filters.includeBots) {
            searchOptions.authorTypes = [MessageSearchAuthorType.NotBot];
        }

        if (filters.mentionsId !== null) {
            searchOptions.mentions = [filters.mentionsId];
        }

        if (!Util.empty(filters.hasTypes)) {
            searchOptions.has = filters.hasTypes;
        }

        if (filters.pinned !== null) {
            searchOptions.pinned = filters.pinned;
        }

        if (filters.since !== null) {
            searchOptions.minId = DiscordUtil.snowflakeFromDate(filters.since);
        }

        if (filters.until !== null) {
            searchOptions.maxId = DiscordUtil.snowflakeFromDate(filters.until);
        }

        let res;

        try {
            res = await getClient().searchMessages(request.guild, searchOptions);
        } catch (err) {
            if (err instanceof DiscordAPIError || err.name === "ClientError") {
                throw new AIError(err.message);
            }

            throw err;
        }

        if (res === null) {
            throw new AIError(
                "That channel or server can't be searched (it doesn't exist, or you can't access it)",
                channelId
            );
        }

        const excludedId = request.msg?.id,
            matches = res.messages.filter(msg => msg.id !== excludedId).slice(0, filters.limit);

        const out = {
            totalResults: res.totalResults,
            count: matches.length,
            messages: await this.formatMessages(matches)
        };

        if (res.doingDeepHistoricalIndex) {
            out.indexing = true;
        }

        if (Util.empty(matches)) {
            out.note = Util.nonemptyString(filters.query)
                ? `No messages matching "${filters.query}" found.`
                : "No messages matched your search filters.";
        }

        return out;
    }

    async _searchHistoryFallback(args, session, filters) {
        const matcher = Util.nonemptyString(filters.query) ? createMatcher(filters.query, filters.isRegex) : null,
            scan = Util.clamp(
                args.scanLimit ?? SearchMessagesTool.defaultScan,
                MessageHistoryTool.pageSize,
                SearchMessagesTool.maxScan
            );

        const msgs = await this.fetchHistory(session, {
            channelId: args.channelId,
            pages: Math.ceil(scan / MessageHistoryTool.pageSize),
            pageSize: MessageHistoryTool.pageSize
        });

        const matches = msgs
            .filter(msg => filters.authorId === null || msg.author.id === filters.authorId)
            .filter(msg => filters.includeBots || !msg.author.bot)
            .filter(msg => filters.pinned === null || msg.pinned === filters.pinned)
            .filter(msg => filters.since === null || msg.createdTimestamp >= filters.since.getTime())
            .filter(msg => filters.until === null || msg.createdTimestamp <= filters.until.getTime())
            .filter(msg => hasContentMatches(msg, filters.hasTypes))
            .filter(msg => matcher === null || matcher.test(getSearchText(msg)))
            .slice(0, filters.limit);

        const out = {
            scanned: msgs.length,
            count: matches.length,
            messages: await this.formatMessages(matches)
        };

        if (Util.empty(matches)) {
            out.note = Util.nonemptyString(filters.query)
                ? `No messages matching "${filters.query}" in the last ${msgs.length} messages.`
                : `No messages matched your filters in the last ${msgs.length} messages.`;
        }

        return out;
    }
}

export default SearchMessagesTool;
