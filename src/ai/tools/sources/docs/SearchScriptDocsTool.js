import DocsTool from "./DocsTool.js";

import AIPhases from "../../../../structures/ai/AIPhases.js";
import AISourceTypes from "../../../../structures/ai/AISourceTypes.js";

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

    static sourceType = AISourceTypes.scriptDocs;
}

export default SearchScriptDocsTool;
