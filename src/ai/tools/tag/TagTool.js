import AITool from "../AITool.js";

import { getClient } from "../../../LevertClient.js";

import AIError from "../../../errors/AIError.js";

class TagTool extends AITool {
    async fetchTag(name) {
        const tag = await getClient().tagManager.fetch(String(name ?? "").trim());

        if (tag === null) {
            throw new AIError(`Tag "${name}" doesn't exist`);
        }

        return tag;
    }
}

export default TagTool;
