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

const httpUrlRegex = /^https?:\/\//i;

function addImages(embed, images) {
    if (Util.empty(images)) {
        return [embed];
    }

    const [first, ...rest] = images,
        hasExternalUrl = httpUrlRegex.test(first);

    if (hasExternalUrl) {
        embed.setURL(first);
    }

    embed.setImage(first);

    return [
        embed,
        ...rest.map(url => {
            const extra = new EmbedBuilder().setImage(url);
            return hasExternalUrl ? extra.setURL(first) : extra;
        })
    ];
}

function formatStatus(emoji, status) {
    return `${emoji} *${escapeMarkdown(status)}...*`;
}

function getDescriptionLimit(embed) {
    const { author, footer } = DiscordUtil.getEmbedData(embed),
        authorLength = DiscordUtil.escapeMassMentions(author.name).length,
        footerLength = DiscordUtil.escapeMassMentions(footer?.text ?? "").length;

    return Math.min(DiscordUtil.embedLimits.description, DiscordUtil.embedCharLimit - authorLength - footerLength);
}

function fitText(text, limit, tail = "") {
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

function formatExtras(result, limit) {
    const questions = AIUtil.formatList(
            "Follow-ups:",
            result.followUps.map(followUp => escapeMarkdown(followUp, { bold: false }))
        ),
        followUps = fitText(questions, limit);

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

function formatError(err) {
    const hint = getErrorHint(err.ref ?? {});
    return [`${getEmoji("error")} ${Util.capitalize(err.message)}.`, hint].filter(Util.nonemptyString).join("\n");
}

function formatRetry(retryIn) {
    if (retryIn <= 0) {
        return "Try again in a minute.";
    }

    return `Try again in ${bold(Util.shortDuration(retryIn))}.`;
}

function getUnavailableReason(status) {
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

function getErrorHint(ref) {
    if (ref.status === httpStatusCodes.UNAUTHORIZED || ref.status === httpStatusCodes.FORBIDDEN) {
        return "The bot's AI API key was rejected.";
    } else if (typeof ref.retryIn === "number") {
        return `${getUnavailableReason(ref.status)} ${formatRetry(ref.retryIn)}`;
    } else {
        return "";
    }
}

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
                text: fitText(AIReplyView._formatFooter(result), DiscordUtil.embedLimits.footer)
            });

        const limit = getDescriptionLimit(embed),
            tailLimit = Math.max(0, limit - Math.min(answer.length, AIReplyView.maxPreviewLength) - 2);

        const { extras, omittedSources } = formatExtras(result, tailLimit);

        const preview = fitText(answer, limit, extras);

        embed.setDescription(AIUtil.joinSections(preview, extras));

        const needsAttachment = preview !== answer || omittedSources,
            fullAnswer = omittedSources
                ? AIUtil.joinSections(answer, AIUtil.formatList("Sources:", result.sources))
                : answer;

        const components = [].concat(session !== null && AIReplyView._createFollowUpRow(session)).filter(Boolean);

        return {
            ...this._createPayload(addImages(embed, result.images), components),
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
            limit = getDescriptionLimit(embed);

        embed.setDescription(fitText(formatError(err), limit));

        return this._createPayload([embed]);
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
            return [formatStatus(AIReplyView.thinkingEmoji, phase)];
        }

        return steps.map(step => formatStatus(step.emoji, step.status));
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
                        session.id,
                        i
                    )
                )
                .setLabel(String(i + 1))
                .setStyle(ButtonStyle.Secondary)
        );

        return new ActionRowBuilder().addComponents(buttons);
    }

    static _createFiles(files, fullAnswer) {
        const attachments = files.flatMap(file => DiscordUtil.getFileAttach(file.content, file.name).files);

        if (fullAnswer !== null && attachments.length < DiscordUtil.msgFileLimit) {
            const limit = getConfig().maxFileSize,
                used = attachments.reduce((bytes, file) => bytes + Util.getByteLength(file.attachment), 0);

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

    _createPayload(embeds, components = []) {
        const payload = { content: "", embeds, components, attachments: [] };

        if (this.pingUser !== null) {
            payload.content = userMention(this.pingUser);
            payload.pings = [this.pingUser];
        }

        return payload;
    }

    _createEmbed(title) {
        const name = fitText(title, DiscordUtil.embedLimits.author);
        return new EmbedBuilder().setAuthor({ name, iconURL: this.icon });
    }

    _renderStatus(phase, steps, text, finishing, cancelSession) {
        const statusText = AIReplyView._formatStatuses(phase, steps).slice(-AIReplyView.maxStatusLines).join("\n"),
            preview = AIReplyView._formatPreview(text, finishing);

        const embed = this._createEmbed(`${this.name} - ${phase}...`),
            limit = getDescriptionLimit(embed);

        embed.setDescription(fitText(AIUtil.joinSections(statusText, preview), limit));

        return this._createPayload([embed], [AIReplyView._createCancelRow(cancelSession)]);
    }
}

export default AIReplyView;
