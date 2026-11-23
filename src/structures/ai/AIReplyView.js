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
    static cancelAction = "cancel";

    static getAction(customId) {
        const [prefix, action] = customId.split(":");
        return prefix === AIReplyView.customIdPrefix ? action : null;
    }

    static getFollowUp(customId, followUps) {
        const [, , idxText] = customId.split(":");
        return followUps[Util.parseInt(idxText)] ?? null;
    }

    static getAnswerText(msg) {
        return Util.first(msg.embeds)?.description ?? msg.content;
    }

    constructor(mention = null) {
        const config = getConfig().ai;

        this.mention = mention;

        this.name = config.name;
        this.icon = config.icon ?? getClient().client.user.displayAvatarURL();
    }

    renderThinking(cancelSession) {
        return this._renderStatus(AIPhases.thinking, [], "", false, cancelSession);
    }

    renderProgress(session, cancelSession) {
        return this._renderStatus(session.phase, session.steps, session.text, session.finishing, cancelSession);
    }

    renderResult(result, session) {
        const answer = result.answer.trim(),
            extras = AIReplyView._joinSections(
                AIReplyView._formatList("Sources:", result.sources),
                AIReplyView._formatList(
                    "Follow-ups:",
                    result.followUps.map(followUp => escapeMarkdown(followUp))
                )
            );

        const answerLimit = AIReplyView._getAnswerLimit(extras);

        const embed = this._createEmbed(this.name)
            .setColor(AIReplyView.answerColor)
            .setDescription(
                AIReplyView._joinSections(Util.trimString(answer, answerLimit, null, { tight: true }), extras)
            )
            .setFooter({ text: AIReplyView._formatFooter(result) });

        const components = session === null ? [] : [AIReplyView._createFollowUpRow(session)];

        return {
            ...this._createPayload(AIReplyView._addImages(embed, result.images), components),
            files: AIReplyView._createFiles(result.files, answer, answerLimit)
        };
    }

    renderFollowUps(session) {
        return { components: [AIReplyView._createFollowUpRow(session)] };
    }

    renderCooldown(waitTime) {
        const waitStr = Util.duration(waitTime, {
            format: true,
            short: true,
            largestOnly: true
        });

        return `${getEmoji("clock")} You are asking too fast. Please slow down! (${bold(waitStr)})`;
    }

    renderCancelled() {
        const embed = this._createEmbed(this.name)
            .setColor(AIReplyView.errorColor)
            .setDescription(`${getEmoji("error")} Thinking cancelled.`);

        return this._createPayload([embed]);
    }

    renderError(err) {
        const embed = this._createEmbed(this.name)
            .setColor(AIReplyView.errorColor)
            .setDescription(AIReplyView._formatError(err));

        return this._createPayload([embed]);
    }

    static _addImages(embed, images) {
        if (Util.empty(images)) {
            return [embed];
        }

        const [first, ...rest] = images;
        embed.setURL(first).setImage(first);

        return [embed, ...rest.map(url => new EmbedBuilder().setURL(first).setImage(url))];
    }

    static _createCustomId(action, ...parts) {
        return [AIReplyView.customIdPrefix, action, ...parts].join(":");
    }

    static _joinSections(...sections) {
        return sections.filter(Util.nonemptyString).join("\n\n");
    }

    static _createCancelRow(session) {
        const button = new ButtonBuilder()
            .setCustomId(AIReplyView._createCustomId(AIReplyView.cancelAction, session.id))
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger);

        return new ActionRowBuilder().addComponents(button);
    }

    static _formatStatus(status) {
        return `${AIReplyView.statusEmoji} *${escapeMarkdown(status)}...*`;
    }

    static _formatPreview(text, finishing) {
        const preview = text.trim();

        const lines = [];

        if (!Util.empty(preview)) {
            lines.push(Util.trimString(preview, AIReplyView.maxPreviewLength, null, { tight: true }));
        }

        if (finishing) {
            lines.push(`*${AIReplyView.finishingStatus}...*`);
        }

        return lines.join("\n");
    }

    static _formatList(header, items) {
        if (Util.empty(items)) {
            return "";
        }

        return [header, ...items.map((item, i) => `${i + 1}. ${item}`)].join("\n");
    }

    static _createFollowUpRow(session) {
        const buttons = session.spec.followUps.map((_, i) =>
            new ButtonBuilder()
                .setCustomId(AIReplyView._createCustomId(AIReplyView.followUpAction, i, session.id))
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

        const seconds = Util.round(result.elapsed * Util.durationSeconds.milli, 1);
        return `Models: ${result.models.join(", ")} | ${usage.join(", ")} | ${seconds}s`;
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

    _createPayload(embeds, components = []) {
        return { content: this.mention ?? "", embeds, components, attachments: [] };
    }

    _createEmbed(title) {
        return new EmbedBuilder().setAuthor({ name: title, iconURL: this.icon });
    }

    _renderStatus(phase, steps, text, finishing, cancelSession) {
        const statuses = Util.empty(steps) ? [phase] : steps.map(step => step.status);

        const statusText = statuses.slice(-AIReplyView.maxStatusLines).map(AIReplyView._formatStatus).join("\n"),
            preview = AIReplyView._formatPreview(text, finishing);

        const embed = this._createEmbed(`${this.name} - ${phase}...`).setDescription(
            AIReplyView._joinSections(statusText, preview)
        );

        return this._createPayload([embed], [AIReplyView._createCancelRow(cancelSession)]);
    }
}

export default AIReplyView;
