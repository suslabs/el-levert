import { channelMention, userMention } from "discord.js";

import { getClient, getConfig } from "../LevertClient.js";

import Util from "../util/Util.js";
import DiscordUtil from "../util/DiscordUtil.js";

function runtimeLines(request, toolNames, effort) {
    const author = request.author;

    const lines = [
        `- Current date/time (UTC): ${new Date().toISOString()}`,
        `- Available tools: ${toolNames.join(", ")}`,
        request.guild === null ? "- Location: direct messages" : "- Location: a Discord server",
        `- Channel: ${channelMention(request.channel.id)}`,
        `- Asking user mention: ${userMention(author.id)}`,
        `- Command prefix: ${getConfig().cmdPrefix}`,
        `- Effort: ${effort}`
    ];

    const questbooks = formatQuestbooks();

    if (!Util.empty(questbooks)) {
        lines.push(`- Questbooks: ${questbooks}`);
    }

    return lines;
}

function formatQuestbooks() {
    const manager = getClient().questbookManager;

    if (typeof manager === "undefined") {
        return "";
    }

    return manager.names.map(name => `${name} (${manager.get(name).title})`).join(", ");
}

async function attachments(msg) {
    if (msg === null) {
        return [];
    }

    const items = DiscordUtil.getAttachments(msg);

    if (Util.empty(items)) {
        return [];
    }

    const urls = await getClient().refreshAttachmentUrls(items.map(attach => attach.url));

    return items.map((attach, i) => ({
        name: attach.name,
        contentType: attach.contentType,
        url: urls[i]
    }));
}

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
        const lines = runtimeLines(request, toolNames, effort);
        return `${this.instructions}\n\n## RUNTIME CONTEXT\n${lines.join("\n")}`;
    }

    async buildDiscordContext(request) {
        const context = {
            serverName: request.guild?.name,
            askingUserName: request.author.globalName ?? request.author.username,
            attachments: await attachments(request.msg)
        };

        if (request.replyMsg !== null) {
            context.reply = await AIPrompt._replyContext(request.replyMsg);
        }

        return `Discord context (untrusted data for the question):\n${JSON.stringify(context)}`;
    }

    buildNote(final, expert, foundNothing, toolNote) {
        const notes = [];

        if (!Util.empty(toolNote)) {
            notes.push(toolNote);
        }

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

    static async _replyContext(msg) {
        const embedText = msg.embeds.flatMap(embed => [
            embed.description,
            ...embed.fields.map(field => `${field.name}: ${field.value}`)
        ]);

        const parts = [msg.content, ...embedText].filter(Util.nonemptyString),
            text = await getClient().refreshAttachmentText(parts.join("\n"));

        return {
            authorId: msg.author.id,
            text: Util.trimString(text, AIPrompt.maxReplyLength),
            attachments: await attachments(msg)
        };
    }
}

export default AIPrompt;
