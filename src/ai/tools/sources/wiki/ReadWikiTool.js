import WikiTool from "./WikiTool.js";
import ToolParams from "../../ToolParams.js";
import TextPager from "../../TextPager.js";

import AIPhases from "../../../../structures/ai/AIPhases.js";

class ReadWikiTool extends WikiTool {
    static info = {
        name: "read_wikipedia",
        emoji: "📑",
        phase: AIPhases.reading,
        description: "Read a Wikipedia article from search_wikipedia as plain text. Use nextOffset to read further.",
        parameters: ToolParams.object(
            {
                title: ToolParams.string("Article title."),
                language: ToolParams.string('Wikipedia language code, e.g. "en", "de" (default "en").'),
                ...TextPager.params
            },
            ["title"]
        )
    };

    getStatus(args) {
        return `Reading "${this.formatArg(args.title)}" on ${this.wiki.name}`;
    }

    async execute(args, session) {
        const title = this.requireString(args, "title"),
            language = this.wiki.getLanguage(args.language);

        const article = await this.wiki.read(title, { language, timeout: session.toolTimeout() });
        return { source: article.url, title: article.title, ...TextPager.page(article.text, args) };
    }
}

export default ReadWikiTool;
