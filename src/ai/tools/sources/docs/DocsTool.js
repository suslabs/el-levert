import SourceTool from "../SourceTool.js";

import Util from "../../../../util/Util.js";

class DocsTool extends SourceTool {
    static maxCalls = 4;

    static defaultLimit = 4;
    static maxLimit = 6;

    static sectionLength = 3000;

    getStatus(args) {
        return `Searching the ${this.source.name} for "${this.formatArg(args.query)}"`;
    }

    execute(args) {
        const query = this.requireString(args, "query"),
            sections = this.source.search(query, this.getLimit(args));

        return {
            query,
            sections: sections.map(section => ({
                title: section.title,
                text: Util.trimString(section.text, DocsTool.sectionLength)
            }))
        };
    }
}

export default DocsTool;
