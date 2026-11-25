import { getClient, getConfig } from "../LevertClient.js";

import Util from "../util/Util.js";

class AIPrompt {
    static maxReplyLength = 1200;

    static finalNote = "Tools are no longer available. Answer now with what you already have.";
    static expertNote = "The pack mode is expert (hard mode). Use expert recipes and quests from now on.";
    static nothingFoundNote =
        "Nothing your tools returned so far answers this: every search came back empty or failed. Don't answer from memory and don't guess names, dates or facts. Try another tool if one fits; otherwise say plainly that you couldn't find it, and mention any search that failed.";

    constructor(instructions) {
        this.instructions = instructions;
    }

    build(request, toolNames, effort) {
        const lines = AIPrompt._runtimeLines(request, toolNames, effort);
        return `${this.instructions}\n\n## RUNTIME CONTEXT\n${lines.join("\n")}`;
    }

    buildNote(final, expert, foundNothing) {
        const notes = [];

        if (expert) {
            notes.push(AIPrompt.expertNote);
        }

        if (foundNothing) {
            notes.push(AIPrompt.nothingFoundNote);
        }

        if (final) {
            notes.push(AIPrompt.finalNote);
        }

        return notes.join("\n");
    }

    static _runtimeLines(request, toolNames, effort) {
        const author = request.author;

        const lines = [
            `- Current date/time (UTC): ${new Date().toISOString()}`,
            `- Available tools: ${toolNames.join(", ")}`,
            request.guild === null ? "- Location: direct messages" : `- Server: ${request.guild.name}`,
            `- Channel: <#${request.channel.id}>`,
            `- Asking user: ${author.globalName ?? author.username} — mention <@${author.id}>`,
            `- Command prefix: ${getConfig().cmdPrefix}`,
            `- Effort: ${effort}`
        ];

        const questbooks = AIPrompt._formatQuestbooks();

        if (!Util.empty(questbooks)) {
            lines.push(`- Questbooks: ${questbooks}`);
        }

        const attachments = AIPrompt._formatAttachments(request.msg);

        if (!Util.empty(attachments)) {
            lines.push(`- Attachments on the question: ${attachments}`);
        }

        if (request.replyMsg !== null) {
            lines.push(...AIPrompt._replyLines(request.replyMsg));
        }

        return lines;
    }

    static _formatQuestbooks() {
        const manager = getClient().questbookManager;

        if (typeof manager === "undefined") {
            return "";
        }

        return manager.names.map(name => `${name} (${manager.get(name).title})`).join(", ");
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
