import TagTool from "./TagTool.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import { getClient } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import TypeTester from "../../../util/TypeTester.js";
import ArrayUtil from "../../../util/ArrayUtil.js";
import DiscordUtil from "../../../util/DiscordUtil.js";
import ToolParams from "../../../util/ai/ToolParams.js";

function formatOutput(out) {
    if (!TypeTester.isObject(out)) {
        return String(out ?? "");
    }

    const embeds = (out.embeds ?? []).map(embed => DiscordUtil.stringifyEmbed(embed));
    return [out.content, ...embeds].filter(Util.nonemptyString).join("\n");
}

class TagCallTool extends TagTool {
    static info = {
        name: "tag_call",
        emoji: "📜",
        phase: AIPhases.running,
        description:
            "Run a tag as the asking user. Files the tag sends (like edited images) are attached to your answer. Image tags (caption, etc.) take the image from the question's attachments or the message it replies to on their own: pass only the text arguments, and add an image URL as the first argument only when the image isn't attached to either. Only use names returned by search_tags or given by the user.",
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
        const rawArgs = ArrayUtil.guaranteeArray(args.args, null, true).join(" "),
            tagArgs = await getClient().refreshAttachmentText(rawArgs);

        const tag = await this.fetchTag(args.name),
            out = await getClient().tagManager.execute(tag, tagArgs, session.request.scriptValues, {
                logContent: false
            });

        const files = TypeTester.isObject(out) ? (out.files ?? []) : [];

        for (const file of files) {
            session.attachFile(file.name, file.attachment);
        }

        const output = await getClient().refreshAttachmentText(formatOutput(out));

        return {
            source: `tag:${tag.name}`,
            output: Util.trimString(output, TagCallTool.maxOutputLength),
            attached: files.map(file => file.name),
            communityMaintained: true
        };
    }
}

export default TagCallTool;
