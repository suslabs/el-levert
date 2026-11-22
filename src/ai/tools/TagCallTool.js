import AITool from "./AITool.js";
import ToolParams from "./ToolParams.js";

import AIPhases from "../AIPhases.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import DiscordUtil from "../../util/DiscordUtil.js";

class TagCallTool extends AITool {
    static info = {
        name: "tag_call",
        phase: AIPhases.running,
        description:
            "Execute a tag as the asking user and return its output. Only use names returned by tri_search or given by the user.",
        parameters: ToolParams.object(
            {
                name: ToolParams.string("Exact tag name."),
                args: ToolParams.stringArray("Arguments passed to the tag.")
            },
            ["name"]
        )
    };

    static maxOutputLength = 3000;

    isAvailable(session) {
        return session.request.hasMessage;
    }

    getStatus(args) {
        return `Running tag "${this.formatArg(args.name)}"`;
    }

    async execute(args, session) {
        const tagManager = getClient().tagManager,
            tag = await tagManager.fetch(String(args.name ?? "").trim());

        if (tag === null) {
            return { error: `Tag "${args.name}" doesn't exist.` };
        }

        const out = await tagManager.execute(tag, (args.args ?? []).join(" "), session.request.scriptValues);

        return {
            source: `tag:${tag.name}`,
            output: Util.trimString(this._formatOutput(out), TagCallTool.maxOutputLength),
            communityMaintained: true
        };
    }

    _formatOutput(out) {
        if (!TypeTester.isObject(out)) {
            return String(out ?? "");
        }

        const embeds = (out.embeds ?? []).map(embed => DiscordUtil.stringifyEmbed(embed));
        return [out.content, ...embeds].filter(Util.nonemptyString).join("\n");
    }
}

export default TagCallTool;
