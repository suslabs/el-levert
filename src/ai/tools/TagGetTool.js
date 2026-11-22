import AITool from "./AITool.js";
import ToolParams from "./ToolParams.js";

import AIPhases from "../AIPhases.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagGetTool extends AITool {
    static info = {
        name: "tag_get",
        phase: AIPhases.reading,
        description:
            "Fetch a tag's body by exact name. Only use names returned by tri_search or given by the user. Tags are community-maintained.",
        parameters: ToolParams.object({ name: ToolParams.string("Exact tag name.") }, ["name"])
    };

    static maxBodyLength = 3000;

    getStatus(args) {
        return `Reading tag "${this.formatArg(args.name)}"`;
    }

    async execute(args) {
        const tagManager = getClient().tagManager;

        let tag = await tagManager.fetch(String(args.name ?? "").trim());

        if (tag === null) {
            return { error: `Tag "${args.name}" doesn't exist.` };
        } else if (tag.isAlias) {
            tag = await tagManager.fetchAlias(tag);
        }

        if (tag.isBinary) {
            return { error: `Tag "${tag.name}" is a binary tag.` };
        }

        return {
            source: `tag:${tag.name}`,
            name: tag.name,
            owner: tag.owner,
            isScript: tag.isScript,
            body: Util.trimString(tag.body, TagGetTool.maxBodyLength),
            communityMaintained: true
        };
    }
}

export default TagGetTool;
