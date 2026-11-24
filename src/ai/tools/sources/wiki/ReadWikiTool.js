import SourceTool from "../SourceTool.js";

import AIPhases from "../../../../structures/ai/AIPhases.js";
import AISourceTypes from "../../../../structures/ai/AISourceTypes.js";

import ToolParams from "../../../../util/ai/ToolParams.js";
import AIUtil from "../../../../util/ai/AIUtil.js";

class ReadWikiTool extends SourceTool {
    static info = {
        name: "read_wikipedia",
        emoji: "📑",
        phase: AIPhases.reading,
        description: "Read a Wikipedia article from search_wikipedia as plain text. Use nextOffset to read further.",
        parameters: ToolParams.object(
            {
                title: ToolParams.string("Article title."),
                language: ToolParams.string('Wikipedia language code, e.g. "en", "de" (default "en").'),
                ...ToolParams.page()
            },
            ["title"]
        )
    };

    static sourceType = AISourceTypes.wiki;

    getStatus(args) {
        return `Reading "${this.formatArg(args.title)}" on ${this.source.name}`;
    }

    async execute(args, session) {
        const title = this.requireString(args, "title"),
            language = this.source.getLanguage(args.language);

        const article = await this.source.read(title, { language, timeout: session.toolTimeout() });
        return { source: article.url, title: article.title, ...AIUtil.pageText(article.text, args) };
    }
}

export default ReadWikiTool;
