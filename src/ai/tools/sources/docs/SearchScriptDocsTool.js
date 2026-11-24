import DocsTool from "./DocsTool.js";

import AIPhases from "../../../../structures/ai/AIPhases.js";

import Util from "../../../../util/Util.js";
import ToolParams from "../../../../util/ai/ToolParams.js";

class SearchScriptDocsTool extends DocsTool {
    static info = {
        name: "search_script_docs",
        emoji: "📘",
        phase: AIPhases.reading,
        description:
            "Search the docs for the bot's JavaScript sandbox (tag scripts, execute_javascript, msg.reply, util, http) and the CanvasKit loader (drawing images, GIFs and video, games). Read them before writing or explaining script code.",
        parameters: ToolParams.object(
            {
                query: ToolParams.string('What you need, e.g. "reply with a file" or "draw a rectangle".'),
                limit: ToolParams.integer("Sections, 1-6 (default 4).")
            },
            ["query"]
        )
    };

    static defaultLimit = 4;
    static maxLimit = 6;

    static sectionLength = 3000;

    getStatus(args) {
        return `Searching the ${this.docs.name} for "${this.formatArg(args.query)}"`;
    }

    execute(args) {
        const query = this.requireString(args, "query"),
            sections = this.docs.search(query, this.getLimit(args));

        return {
            query,
            sections: sections.map(section => ({
                title: section.title,
                text: Util.trimString(section.text, SearchScriptDocsTool.sectionLength)
            }))
        };
    }
}

export default SearchScriptDocsTool;
