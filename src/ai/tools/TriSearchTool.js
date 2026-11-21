import AITool from "./AITool.js";
import ToolParams from "./ToolParams.js";

import KnowledgeKinds from "../knowledge/KnowledgeKinds.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";

class TriSearchTool extends AITool {
    static info = {
        name: "tri_search",
        description:
            "PRIMARY for game/modpack/mechanic questions. Searches questbook/domain/glossary sources first, then the bot's tags (by name and body), then the web only if nothing local matched. If results are truncated and the question is procedural/build-related, call again with questDetails set to the returned IDs.",
        parameters: ToolParams.object({
            query: ToolParams.string("Search text."),
            scope: ToolParams.string("Restrict the search.", {
                enum: ["all", ...KnowledgeKinds.values, "tags", "web"]
            }),
            questDetails: ToolParams.stringArray("Entry IDs from earlier results to fetch in full (query is ignored)."),
            limit: ToolParams.integer("Results per source, 1-8 (default 5)."),
            allowWeb: ToolParams.boolean("Fall back to web search when nothing local matches (default true).")
        })
    };

    static defaultLimit = 5;
    static maxLimit = 8;
    static maxDetails = 6;

    static snippetLength = 240;
    static detailLength = 2500;

    async execute(args, session) {
        if (!Util.empty(args.questDetails ?? [])) {
            return {
                mode: "questDetails",
                entries: args.questDetails.slice(0, TriSearchTool.maxDetails).map(id => this._getDetails(id))
            };
        }

        const query = String(args.query ?? "").trim();

        if (Util.empty(query)) {
            return { error: "Provide query, or questDetails with IDs from earlier results." };
        }

        const scope = args.scope ?? "all",
            limit = Util.clamp(args.limit ?? TriSearchTool.defaultLimit, 1, TriSearchTool.maxLimit);

        const out = {
            query,
            priority: "questbook/domain > tags > web",
            results: {},
            notes: []
        };

        this._searchKnowledge(out, query, scope, limit);

        if (scope === "all" || scope === "tags") {
            out.results.tags = await this._searchTags(query, limit);
            out.notes.push("Tags are community-maintained; prefer questbook/domain entries when they disagree.");
        }

        if (Object.values(out.results).some(list => list.some(entry => entry.truncated))) {
            out.notes.push(
                "Some entries are truncated; for build/procedure answers call tri_search with questDetails."
            );
        }

        const localHits = Object.values(out.results).reduce((sum, list) => sum + list.length, 0),
            useWeb = (args.allowWeb ?? true) && (scope === "all" || scope === "web");

        if (localHits === 0 && useWeb) {
            out.notes.push("No local matches; fell back to web search.");
            out.web = await this.manager.webSearcher.search(query, limit, session.toolTimeout());
        }

        return out;
    }

    _searchKnowledge(out, query, scope, limit) {
        const knowledge = this.manager.knowledge;

        if (Util.empty(knowledge.kinds)) {
            out.notes.push("No questbook/domain/glossary source is configured for this bot.");
            return;
        }

        for (const kind of knowledge.kinds) {
            if (scope === "all" || scope === kind) {
                out.results[kind] = knowledge.search(query, kind, limit).map(res => this._formatEntry(res));
            }
        }
    }

    _formatEntry({ doc, score }) {
        return {
            source: `${doc.kind}:${doc.id}`,
            id: doc.id,
            title: doc.title,
            chapter: doc.chapter,
            snippet: Util.trimString(doc.text, TriSearchTool.snippetLength),
            score: Util.round(score, 2),
            truncated: doc.text.length > TriSearchTool.snippetLength || !Util.empty(doc.tasks)
        };
    }

    _getDetails(id) {
        const knowledge = this.manager.knowledge,
            entry = knowledge.get(id);

        if (entry === null) {
            return { id, error: "No entry with this ID." };
        }

        return {
            source: `${entry.kind}:${entry.id}`,
            id: entry.id,
            title: entry.title,
            chapter: entry.chapter,
            text: Util.trimString(entry.text, TriSearchTool.detailLength),
            tasks: entry.tasks,
            prereqs: entry.prereqs.map(prereq => ({ id: prereq, title: knowledge.get(prereq)?.title ?? null })),
            ref: entry.ref
        };
    }

    async _searchTags(query, limit) {
        const tagManager = getClient().tagManager;

        const { results: nameMatches } = await tagManager.search(query, {}, { limit }),
            { results: bodyMatches } = await tagManager.fullSearch(query, { maxResults: limit });

        const names = ArrayUtil.unique([...nameMatches, ...bodyMatches.map(match => match.name)]).slice(0, limit),
            tags = await Promise.all(names.map(name => tagManager.fetch(name)));

        return tags.filter(tag => tag !== null && !tag.isBinary).map(tag => this._formatTag(tag));
    }

    _formatTag(tag) {
        return {
            source: `tag:${tag.name}`,
            name: tag.name,
            isScript: tag.isScript,
            isAlias: tag.isAlias,
            snippet: Util.trimString(tag.body, TriSearchTool.snippetLength),
            truncated: tag.body.length > TriSearchTool.snippetLength,
            communityMaintained: true
        };
    }
}

export default TriSearchTool;
