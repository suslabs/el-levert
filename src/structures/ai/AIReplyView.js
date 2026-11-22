import { ActionRowBuilder, bold, ButtonBuilder, ButtonStyle, EmbedBuilder, escapeMarkdown } from "discord.js";

import AIPhases from "./AIPhases.js";

import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import { httpStatusCodes, isServerErrorStatus } from "../../util/misc/HttpStatusCodes.js";

class AIReplyView {
    static statusEmoji = "▶️";
    static finishingStatus = "Finishing response";

    static answerColor = 0x75fa4c;
    static errorColor = 0xed4245;

    static maxStatusLines = 5;
    static maxPreviewLength = 200;

    static answerFilename = "answer.md";

    static customIdPrefix = "ai";
    static followUpAction = "followup";

    static getFollowUp(customId, followUps) {
        const [prefix, action, idxText] = customId.split(":");

        if (prefix !== AIReplyView.customIdPrefix || action !== AIReplyView.followUpAction) {
            return null;
        }

        return followUps[Util.parseInt(idxText)] ?? null;
    }

    static getAnswerText(msg) {
        return Util.first(msg.embeds)?.description ?? msg.content;
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
        const answer = result.answer.trim(),
            extras = [AIReplyView._formatSources(result.sources), AIReplyView._formatFollowUps(result.followUps)]
                .filter(Util.nonemptyString)
                .join("\n\n");

        const answerLimit = AIReplyView._getAnswerLimit(extras);

        const embed = this._createEmbed(this.name)
            .setColor(AIReplyView.answerColor)
            .setDescription(
                [Util.trimString(answer, answerLimit, null, { tight: true }), extras]
                    .filter(Util.nonemptyString)
                    .join("\n\n")
            )
            .setFooter({ text: AIReplyView._formatFooter(result) });

        if (result.image !== null) {
            embed.setImage(result.image);
        }

        return {
            embeds: [embed],
            components: session === null ? [] : [AIReplyView._createFollowUpRow(session)],
            files: AIReplyView._createFiles(result.files, answer, answerLimit)
        };
    }

    renderCooldown(waitTime) {
        const waitStr = Util.duration(waitTime, {
            format: true,
            short: true,
            largestOnly: true
        });

        return `${getEmoji("clock")} You are asking too fast. Please slow down! (${bold(waitStr)})`;
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
        const lines = [],
            preview = text.trim();

        if (!Util.empty(preview)) {
            lines.push(Util.trimString(preview, AIReplyView.maxPreviewLength, null, { tight: true }));
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

    static _formatFollowUps(followUps) {
        if (Util.empty(followUps)) {
            return "";
        }

        return ["Follow-ups:", ...followUps.map((followUp, i) => `${i + 1}. ${escapeMarkdown(followUp)}`)].join("\n");
    }

    static _createFollowUpRow(session) {
        const buttons = session.spec.followUps.map((_, i) =>
            new ButtonBuilder()
                .setCustomId(`${AIReplyView.customIdPrefix}:${AIReplyView.followUpAction}:${i}:${session.id}`)
                .setLabel(String(i + 1))
                .setStyle(ButtonStyle.Secondary)
        );

        return new ActionRowBuilder().addComponents(buttons);
    }

    static _getAnswerLimit(extras) {
        return Util.empty(extras) ? DiscordUtil.embedCharLimit : DiscordUtil.embedCharLimit - extras.length - 2;
    }

    static _createFiles(files, answer, answerLimit) {
        if (answer.length > answerLimit) {
            files = [...files, { name: AIReplyView.answerFilename, content: answer }];
        }

        return files.flatMap(file => DiscordUtil.getFileAttach(file.content, file.name).files);
    }

    static _formatFooter(result) {
        const usage = [`${Util.formatNumber(result.tokens)} tok`];

        if (result.reasoning > 0) {
            usage.push(`${Util.formatNumber(result.reasoning)} reasoning`);
        }

        return `Models: ${result.models.join(", ")} | ${usage.join(", ")}`;
    }

    static _formatError(err) {
        const hint = AIReplyView._getErrorHint(err.ref ?? {});
        return [`${getEmoji("error")} ${Util.capitalize(err.message)}.`, hint].filter(Util.nonemptyString).join("\n");
    }

    static _getErrorHint(ref) {
        if (ref.reason === "ACCESS_TOKEN_TYPE_UNSUPPORTED") {
            return "Google rejected the new-format (AQ.) key. Use a standard key (starts with AIza) from Google Cloud Console.";
        } else if (ref.status === httpStatusCodes.TOO_MANY_REQUESTS) {
            return "The Gemini quota is used up for now. Try again in a minute.";
        } else if (ref.status === httpStatusCodes.UNAUTHORIZED || ref.status === httpStatusCodes.FORBIDDEN) {
            return "The bot's Gemini API key was rejected.";
        } else if (isServerErrorStatus(ref.status)) {
            return "Gemini is overloaded right now. Try again in a minute.";
        } else {
            return "";
        }
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
