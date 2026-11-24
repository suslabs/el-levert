import TagTool from "./TagTool.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import { getClient } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import ArrayUtil from "../../../util/ArrayUtil.js";
import ToolParams from "../../../util/ai/ToolParams.js";

class SearchTagsTool extends TagTool {
    static info = {
        name: "search_tags",
        emoji: "🔎",
        phase: AIPhases.searching,
        description:
            "Search the bot's tags by name and by the text in their bodies. For modpack questions, use it after the questbook and recipes; for other questions, after the web.",
        parameters: ToolParams.object(
            {
                query: ToolParams.string("Search text."),
                limit: ToolParams.integer("Results, 1-8 (default 5).")
            },
            ["query"]
        )
    };

    static defaultLimit = 5;
    static maxLimit = 8;

    static snippetLength = 240;

    getStatus(args) {
        return `Searching tags for "${this.formatArg(args.query)}"`;
    }

    async execute(args) {
        const query = this.requireString(args, "query");

        const limit = this.getLimit(args);

        const tagManager = getClient().tagManager;

        const { results: nameMatches } = await tagManager.search(query, {}, { limit }),
            { results: bodyMatches } = await tagManager.fullSearch(query, { maxResults: limit });

        const names = ArrayUtil.unique([...nameMatches, ...bodyMatches.map(match => match.name)]).slice(0, limit),
            tags = await Promise.all(names.map(name => tagManager.fetch(name)));

        return {
            query,
            tags: tags.filter(tag => tag !== null && !tag.isBinary).map(tag => this._formatTag(tag))
        };
    }

    _formatTag(tag) {
        return {
            source: `tag:${tag.name}`,
            name: tag.name,
            isScript: tag.isScript,
            isAlias: tag.isAlias,
            snippet: Util.trimString(tag.body, SearchTagsTool.snippetLength),
            truncated: tag.body.length > SearchTagsTool.snippetLength,
            communityMaintained: true
        };
    }
}

export default SearchTagsTool;
