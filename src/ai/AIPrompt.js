import { getConfig } from "../LevertClient.js";

import Util from "../util/Util.js";

class AIPrompt {
    static maxReplyLength = 1200;

    constructor(instructions) {
        this.instructions = instructions;
    }

    build(request, toolNames) {
        return `${this.instructions}\n\n## RUNTIME CONTEXT\n${AIPrompt._runtimeLines(request, toolNames).join("\n")}`;
    }

    static _runtimeLines(request, toolNames) {
        const author = request.author;

        const lines = [
            `- Current date/time (UTC): ${new Date().toISOString()}`,
            `- Available tools: ${toolNames.join(", ")}`,
            request.guild === null ? "- Location: direct messages" : `- Server: ${request.guild.name}`,
            `- Channel: <#${request.channel.id}>`,
            `- Asking user: ${author.globalName ?? author.username} — mention <@${author.id}>`,
            `- Command prefix: ${getConfig().cmdPrefix}`
        ];

        const attachments = AIPrompt._formatAttachments(request.msg);

        if (!Util.empty(attachments)) {
            lines.push(`- Attachments on the question: ${attachments}`);
        }

        if (request.replyMsg !== null) {
            lines.push(...AIPrompt._replyLines(request.replyMsg));
        }

        return lines;
    }

    static _formatAttachments(msg) {
        if (msg === null) {
            return "";
        }

        return Array.from(msg.attachments.values())
            .map(attach => `${attach.name} (${attach.contentType ?? "unknown"}) ${attach.url}`)
            .join(" | ");
    }

    static _replyLines(replyMsg) {
        const embedText = replyMsg.embeds.flatMap(embed => [
            embed.description,
            ...embed.fields.map(field => `${field.name}: ${field.value}`)
        ]);

        const parts = [replyMsg.content, ...embedText].filter(Util.nonemptyString),
            text = Util.trimString(parts.join("\n"), AIPrompt.maxReplyLength);

        const lines = [`- The question replies to a message by <@${replyMsg.author.id}>: """${text}"""`];

        const attachments = AIPrompt._formatAttachments(replyMsg);

        if (!Util.empty(attachments)) {
            lines.push(`  That message has attachments: ${attachments}`);
        }

        return lines;
    }
}

export default AIPrompt;
