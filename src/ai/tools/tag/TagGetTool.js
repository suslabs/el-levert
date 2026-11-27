import TagTool from "./TagTool.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import { getClient } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import ToolParams from "../../../util/ai/ToolParams.js";

import AIError from "../../../errors/AIError.js";

class TagGetTool extends TagTool {
    static info = {
        name: "tag_get",
        emoji: "🏷️",
        phase: AIPhases.reading,
        description:
            "Fetch a tag's body by exact name. Only use names returned by search_tags or given by the user. Tags are community-maintained.",
        parameters: ToolParams.object({ name: ToolParams.string("Exact tag name.") }, ["name"])
    };

    static maxBodyLength = 3000;

    getStatus(args) {
        return `Reading tag "${this.formatArg(args.name)}"`;
    }

    async execute(args) {
        let tag = await this.fetchTag(args.name);

        if (tag.isAlias) {
            tag = await getClient().tagManager.fetchAlias(tag);
        }

        if (tag.isBinary) {
            throw new AIError(`Tag "${tag.name}" is a binary tag`);
        }

        const body = await getClient().refreshAttachmentText(tag.body);

        return {
            source: `tag:${tag.name}`,
            name: tag.name,
            owner: tag.owner,
            isScript: tag.isScript,
            body: Util.trimString(body, TagGetTool.maxBodyLength),
            communityMaintained: true
        };
    }
}

export default TagGetTool;
