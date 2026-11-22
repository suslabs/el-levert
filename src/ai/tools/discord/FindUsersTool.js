import AITool from "../AITool.js";
import ToolParams from "../ToolParams.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import { getClient } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";

import AIError from "../../../errors/AIError.js";

class FindUsersTool extends AITool {
    static info = {
        name: "find_users",
        phase: AIPhases.searching,
        description:
            "Identify server members or bots by name, nickname, mention or ID. A unique exact match is final: stop retrieval and do not web search.",
        parameters: ToolParams.object(
            {
                query: ToolParams.string("Name, nickname, @mention or user ID."),
                limit: ToolParams.integer("Max matches, 1-10 (default 5).")
            },
            ["query"]
        )
    };

    static defaultLimit = 5;
    static maxLimit = 10;

    getStatus(args) {
        return `Looking up "${this.formatArg(args.query)}"`;
    }

    async execute(args, session) {
        const query = String(args.query ?? "")
            .trim()
            .replace(FindUsersTool._mentionPrefixRegex, "");

        if (Util.empty(query)) {
            throw new AIError("query is required");
        }

        const limit = Util.clamp(args.limit ?? FindUsersTool.defaultLimit, 1, FindUsersTool.maxLimit),
            found = await getClient().findUsers(query, { sv_id: session.request.guildId, limit });

        const lower = query.toLowerCase(),
            matches = found.map(member => this._formatUser(member, lower));

        const exact = matches.filter(match => match.exactMatch);

        if (Util.single(exact)) {
            return { matches: exact, note: "Unique exact match. Stop retrieval; do not web search." };
        }

        return { matches, note: this._getNote(matches, exact) };
    }

    static _mentionPrefixRegex = /^@/;

    _formatUser(member, lower) {
        const user = member.user,
            names = [user.id, user.username, user.globalName, member.nickname, member.displayName];

        return {
            id: user.id,
            mention: `<@${user.id}>`,
            username: user.username,
            displayName: member.displayName ?? user.globalName ?? user.username,
            bot: user.bot,
            exactMatch: names.some(name => typeof name === "string" && name.toLowerCase() === lower)
        };
    }

    _getNote(matches, exact) {
        if (Util.empty(matches)) {
            return "No users matched.";
        } else if (Util.multiple(exact)) {
            return "Several exact matches; ask which one is meant.";
        } else {
            return "Partial matches only.";
        }
    }
}

export default FindUsersTool;
