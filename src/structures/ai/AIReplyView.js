import {
    ActionRowBuilder,
    bold,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    escapeMarkdown,
    userMention
} from "discord.js";

import AIAnswerParser from "../../ai/AIAnswerParser.js";
import ComponentSession from "../interaction/ComponentSession.js";

import AIPhases from "./AIPhases.js";

import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import AIUtil from "../../util/ai/AIUtil.js";
import { httpStatusCodes, isServerErrorStatus } from "../../util/misc/HttpStatusCodes.js";

class AIReplyView {
    static thinkingEmoji = "💭";
    static finishingStatus = "Finishing response";

    static answerColor = 0x75fa4c;
    static errorColor = 0xed4245;

    static maxStatusLines = 5;
    static maxPreviewLength = 200;

    static answerFilename = "answer.md";
    static expertLabel = "Expert mode";

    static customIdPrefix = "ai";
    static followUpAction = "followup";
    static cancelAction = "cancel";

    static getAction(customId) {
        const parsed = ComponentSession.parseCustomId(customId);
        return parsed?.prefix === AIReplyView.customIdPrefix ? parsed.action : null;
    }

    static getFollowUp(customId, followUps) {
        const idxText = Util.first(ComponentSession.parseCustomId(customId)?.args);
        return followUps[Util.parseInt(idxText)] ?? null;
    }

    static isExpertAnswer(msg) {
        return Util.first(msg.embeds)?.footer?.text?.includes(AIReplyView.expertLabel) ?? false;
    }

    static getAnswerText(msg) {
        return Util.first(msg.embeds)?.description ?? msg.content;
    }

    constructor(pingUser = null) {
        const config = getConfig().ai;

        this.pingUser = pingUser;

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
        const answer = result.answer.trim();
        const embed = this._createEmbed(this.name)
            .setColor(AIReplyView.answerColor)
            .setFooter({
                text: AIReplyView._fitText(AIReplyView._formatFooter(result), DiscordUtil.embedLimits.footer)
            });

        const limit = AIReplyView._getDescriptionLimit(embed),
            tailLimit = Math.max(0, limit - Math.min(answer.length, AIReplyView.maxPreviewLength) - 2);

        const { extras, omittedSources } = AIReplyView._formatExtras(result, tailLimit),
            preview = AIReplyView._fitText(answer, limit, extras);

        embed.setDescription(AIUtil.joinSections(preview, extras));

        const needsAttachment = preview !== answer || omittedSources;
        const fullAnswer = omittedSources
            ? AIUtil.joinSections(answer, AIUtil.formatList("Sources:", result.sources))
            : answer;

        const components = session === null ? [] : [AIReplyView._createFollowUpRow(session)];

        return {
            ...this._createPayload(AIReplyView._addImages(embed, result.images), components),
            files: AIReplyView._createFiles(result.files, needsAttachment ? fullAnswer : null)
        };
    }

    renderFollowUps(session) {
        return { components: [AIReplyView._createFollowUpRow(session)] };
    }

    renderCooldown(waitTime) {
        return `${getEmoji("clock")} You are asking too fast. Please slow down! (${bold(Util.shortDuration(waitTime))})`;
    }

    renderCancelled() {
        const embed = this._createEmbed(this.name)
            .setColor(AIReplyView.errorColor)
            .setDescription(`${getEmoji("error")} Thinking cancelled.`);

        return this._createPayload([embed]);
    }

    renderError(err) {
        const embed = this._createEmbed(this.name).setColor(AIReplyView.errorColor),
            limit = AIReplyView._getDescriptionLimit(embed);

        embed.setDescription(AIReplyView._fitText(AIReplyView._formatError(err), limit));

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

    static _createCancelRow(session) {
        const button = new ButtonBuilder()
            .setCustomId(
                ComponentSession.createCustomId(AIReplyView.customIdPrefix, AIReplyView.cancelAction, session.id)
            )
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger);

        return new ActionRowBuilder().addComponents(button);
    }

    static _formatStatuses(phase, steps) {
        if (Util.empty(steps)) {
            return [AIReplyView._formatStatus(AIReplyView.thinkingEmoji, phase)];
        }

        return steps.map(step => AIReplyView._formatStatus(step.emoji, step.status));
    }

    static _formatStatus(emoji, status) {
        return `${emoji} *${escapeMarkdown(status)}...*`;
    }

    static _formatPreview(text, finishing) {
        const preview = AIAnswerParser.getPreview(text).trim();

        const lines = [];

        if (!Util.empty(preview)) {
            lines.push(Util.trimString(preview, AIReplyView.maxPreviewLength, null, { tight: true }));
        }

        if (finishing) {
            lines.push(`*${AIReplyView.finishingStatus}...*`);
        }

        return lines.join("\n");
    }

    static _createFollowUpRow(session) {
        const buttons = session.spec.followUps.map((_, i) =>
            new ButtonBuilder()
                .setCustomId(
                    ComponentSession.createCustomId(
                        AIReplyView.customIdPrefix,
                        AIReplyView.followUpAction,
                        i,
                        session.id
                    )
                )
                .setLabel(String(i + 1))
                .setStyle(ButtonStyle.Secondary)
        );

        return new ActionRowBuilder().addComponents(buttons);
    }

    static _getDescriptionLimit(embed) {
        const { author, footer } = DiscordUtil.getEmbedData(embed);
        const authorLength = DiscordUtil.escapeMassMentions(author.name).length,
            footerLength = DiscordUtil.escapeMassMentions(footer?.text ?? "").length;

        return Math.min(DiscordUtil.embedLimits.description, DiscordUtil.embedCharLimit - authorLength - footerLength);
    }

    // The message handler escapes mass mentions after rendering, so measure that form as well.
    static _fitText(text, limit, tail = "") {
        let fitted = text;

        for (;;) {
            const length = DiscordUtil.escapeMassMentions(AIUtil.joinSections(fitted, tail)).length,
                excess = length - limit;

            if (excess <= 0 || Util.empty(fitted)) {
                return fitted;
            }

            const available = fitted.length - excess;
            fitted = available < 3 ? "" : Util.trimString(text, available, null, { tight: true });
        }
    }

    static _formatExtras(result, limit) {
        const questions = AIUtil.formatList(
            "Follow-ups:",
            result.followUps.map(followUp => escapeMarkdown(followUp, { bold: false }))
        );
        const followUps = AIReplyView._fitText(questions, limit);
        const sources = [];

        for (const source of result.sources) {
            const candidate = AIUtil.joinSections(AIUtil.formatList("Sources:", [...sources, source]), followUps);

            if (DiscordUtil.escapeMassMentions(candidate).length <= limit) {
                sources.push(source);
            }
        }

        return {
            extras: AIUtil.joinSections(AIUtil.formatList("Sources:", sources), followUps),
            omittedSources: sources.length < result.sources.length
        };
    }

    static _createFiles(files, fullAnswer) {
        const attachments = files.flatMap(file => DiscordUtil.getFileAttach(file.content, file.name).files);

        if (fullAnswer !== null && attachments.length < DiscordUtil.msgFileLimit) {
            const limit = getConfig().maxFileSize;
            const used = attachments.reduce((bytes, file) => bytes + Util.getByteLength(file.attachment), 0);

            if (limit <= 0 || used + Util.getByteLength(fullAnswer) <= limit) {
                const names = new Set(attachments.map(file => file.name));
                let name = AIReplyView.answerFilename;

                for (let i = 2; names.has(name); i++) {
                    name = AIReplyView.answerFilename.replace(".md", `-${i}.md`);
                }

                attachments.push(...DiscordUtil.getFileAttach(fullAnswer, name).files);
            }
        }

        return attachments;
    }

    static _formatFooter(result) {
        const usage = [`${Util.formatNumber(result.tokens)} tok`];

        if (result.reasoning > 0) {
            usage.push(`${Util.formatNumber(result.reasoning)} reasoning`);
        }

        const seconds = Util.round(result.elapsed * Util.durationSeconds.milli, 1),
            parts = [usage.join(", "), `${seconds}s`];

        if (!Util.empty(result.models)) {
            parts.unshift(`Models: ${result.models.join(", ")}`);
        }

        if (result.expert) {
            parts.push(AIReplyView.expertLabel);
        }

        return parts.join(" | ");
    }

    static _formatError(err) {
        const hint = AIReplyView._getErrorHint(err.ref ?? {});
        return [`${getEmoji("error")} ${Util.capitalize(err.message)}.`, hint].filter(Util.nonemptyString).join("\n");
    }

    static _formatRetry(retryIn) {
        if (retryIn <= 0) {
            return "Try again in a minute.";
        }

        return `Try again in ${bold(Util.shortDuration(retryIn))}.`;
    }

    static _getUnavailableReason(status) {
        if (status === httpStatusCodes.TOO_MANY_REQUESTS) {
            return "The AI usage limits are used up for now.";
        } else if (status === httpStatusCodes.PAYMENT_REQUIRED) {
            return "The AI provider reports a billing or credit limit.";
        } else if (isServerErrorStatus(status)) {
            return "The AI models are overloaded right now.";
        } else {
            return "Every model is busy right now.";
        }
    }

    static _getErrorHint(ref) {
        if (ref.status === httpStatusCodes.UNAUTHORIZED || ref.status === httpStatusCodes.FORBIDDEN) {
            return "The bot's AI API key was rejected.";
        } else if (typeof ref.retryIn === "number") {
            return `${AIReplyView._getUnavailableReason(ref.status)} ${AIReplyView._formatRetry(ref.retryIn)}`;
        } else {
            return "";
        }
    }

    _createPayload(embeds, components = []) {
        const payload = { content: "", embeds, components, attachments: [] };

        if (this.pingUser !== null) {
            payload.content = userMention(this.pingUser);
            payload.pings = [this.pingUser];
        }

        return payload;
    }

    _createEmbed(title) {
        const name = AIReplyView._fitText(title, DiscordUtil.embedLimits.author);
        return new EmbedBuilder().setAuthor({ name, iconURL: this.icon });
    }

    _renderStatus(phase, steps, text, finishing, cancelSession) {
        const statusText = AIReplyView._formatStatuses(phase, steps).slice(-AIReplyView.maxStatusLines).join("\n"),
            preview = AIReplyView._formatPreview(text, finishing);

        const embed = this._createEmbed(`${this.name} - ${phase}...`),
            limit = AIReplyView._getDescriptionLimit(embed);

        embed.setDescription(AIReplyView._fitText(AIUtil.joinSections(statusText, preview), limit));

        return this._createPayload([embed], [AIReplyView._createCancelRow(cancelSession)]);
    }
}

export default AIReplyView;
