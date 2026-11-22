import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, escapeMarkdown } from "discord.js";

import AIPhases from "./AIPhases.js";

import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import { httpStatusCodes } from "../../util/misc/HttpStatusCodes.js";

class AIReplyView {
    static statusEmoji = "▶️";
    static finishingStatus = "Finishing response";

    static answerColor = 0x75fa4c;
    static errorColor = 0xed4245;

    static maxStatusLines = 5;
    static maxPreviewLength = 200;

    static customIdPrefix = "ai";
    static followUpAction = "followup";

    static getFollowUp(customId, followUps) {
        const [prefix, action, idxText] = customId.split(":");

        if (prefix !== AIReplyView.customIdPrefix || action !== AIReplyView.followUpAction) {
            return null;
        }

        return followUps[Util.parseInt(idxText)] ?? null;
    }

    constructor() {
        const config = getConfig().ai;

        this.name = config.name;
        this.icon = config.icon ?? getClient().client.user.displayAvatarURL();
    }

    renderThinking() {
        return this._renderStatus(AIPhases.thinking, [], "", false);
    }

    renderProgress(session) {
        return this._renderStatus(session.phase, session.steps, session.text, session.finishing);
    }

    renderResult(result, session) {
        const embed = this._createEmbed(this.name)
            .setColor(AIReplyView.answerColor)
            .setDescription(
                AIReplyView._fitDescription(result.answer.trim(), AIReplyView._formatSources(result.sources))
            )
            .setFooter({ text: AIReplyView._formatFooter(result) });

        return {
            embeds: [embed],
            components: session === null ? [] : [AIReplyView._createFollowUpRow(session)]
        };
    }

    renderError(err) {
        const embed = this._createEmbed(this.name)
            .setColor(AIReplyView.errorColor)
            .setDescription(AIReplyView._formatError(err));

        return { embeds: [embed] };
    }

    static _formatStatus(status) {
        return `${AIReplyView.statusEmoji} *${escapeMarkdown(status)}...*`;
    }

    static _formatPreview(text, finishing) {
        const lines = [];

        if (!Util.empty(text.trim())) {
            lines.push(Util.trimString(text.trim(), AIReplyView.maxPreviewLength, null, { tight: true }));
        }

        if (finishing) {
            lines.push(`*${AIReplyView.finishingStatus}...*`);
        }

        return lines.join("\n");
    }

    static _formatSources(sources) {
        if (Util.empty(sources)) {
            return "";
        }

        return ["Sources:", ...sources.map((source, i) => `${i + 1}. ${source}`)].join("\n");
    }

    static _createFollowUpRow(session) {
        const buttons = session.spec.followUps.map((followUp, i) =>
            new ButtonBuilder()
                .setCustomId(`${AIReplyView.customIdPrefix}:${AIReplyView.followUpAction}:${i}:${session.id}`)
                .setLabel(followUp)
                .setStyle(ButtonStyle.Secondary)
        );

        return new ActionRowBuilder().addComponents(buttons);
    }

    static _fitDescription(answer, sources) {
        if (Util.empty(sources)) {
            return Util.trimString(answer, DiscordUtil.embedCharLimit, null, { tight: true });
        }

        const answerLimit = DiscordUtil.embedCharLimit - sources.length - 2;
        return `${Util.trimString(answer, answerLimit, null, { tight: true })}\n\n${sources}`;
    }

    static _formatFooter(result) {
        const tokens = Util.formatNumber(result.tokens),
            reasoning = Util.formatNumber(result.reasoning);

        return `Models: ${result.model} | ${tokens} tok, ${reasoning} reasoning`;
    }

    static _formatError(err) {
        const ref = err.ref ?? {};
        let hint = "";

        if (ref.reason === "ACCESS_TOKEN_TYPE_UNSUPPORTED") {
            hint =
                "\nGoogle rejected the new-format (AQ.) key. Use a standard key (starts with AIza) from Google Cloud Console.";
        } else if (ref.status === httpStatusCodes.TOO_MANY_REQUESTS) {
            hint = "\nThe Gemini quota is used up for now. Try again in a minute.";
        } else if (ref.status === httpStatusCodes.UNAUTHORIZED || ref.status === httpStatusCodes.FORBIDDEN) {
            hint = "\nThe bot's Gemini API key was rejected.";
        }

        return `${getEmoji("error")} ${Util.capitalize(err.message)}.${hint}`;
    }

    _createEmbed(title) {
        return new EmbedBuilder().setAuthor({ name: title, iconURL: this.icon });
    }

    _renderStatus(phase, steps, text, finishing) {
        const statuses = Util.empty(steps) ? [phase] : steps.map(step => step.status);

        const statusText = statuses.slice(-AIReplyView.maxStatusLines).map(AIReplyView._formatStatus).join("\n"),
            preview = AIReplyView._formatPreview(text, finishing);

        const embed = this._createEmbed(`${this.name} - ${phase}...`).setDescription(
            [statusText, preview].filter(Util.nonemptyString).join("\n\n")
        );

        return { embeds: [embed] };
    }
}

export default AIReplyView;
