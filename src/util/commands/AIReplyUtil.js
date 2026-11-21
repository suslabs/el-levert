import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

import AIRequest from "../../ai/AIRequest.js";
import AIReplyUpdater from "../../structures/ai/AIReplyUpdater.js";
import ComponentSession from "../../structures/interaction/ComponentSession.js";

import AIStepStatus from "../../ai/AIStepStatus.js";
import InteractionModes from "../../structures/interaction/InteractionModes.js";

import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

import Util from "../Util.js";
import ArrayUtil from "../ArrayUtil.js";
import DiscordUtil from "../DiscordUtil.js";
import HttpUtil from "../misc/HttpUtil.js";
import { httpStatusCodes } from "../misc/HttpStatusCodes.js";

const AIReplyUtil = Object.freeze({
    customIdPrefix: "ai",
    followUpAction: "followup",

    maxQuestionLength: 200,
    maxArgLength: 40,
    maxButtonLabelLength: 80,

    expectedErrors: new Set(["AIError", "AxiosError"]),
    _wwwRegex: /^www\./,
    stepArgKeys: ["query", "name", "url", "code", "value"],

    answer: async (ctx, request, question, history) => {
        const updater = new AIReplyUpdater(ctx);
        await updater.start(AIReplyUtil.renderThinking(question));

        let result;

        try {
            result = await getClient().aiManager.ask(question, request, {
                history,
                onProgress: session => updater.update(AIReplyUtil.renderProgress(question, session))
            });
        } catch (err) {
            if (!AIReplyUtil.expectedErrors.has(err.name)) {
                throw err;
            }

            return await updater.finish({ content: AIReplyUtil.formatError(err), embeds: [], components: [] });
        }

        const nextHistory = [...history, { role: "user", text: question }, { role: "model", text: result.answer }],
            session = Util.empty(result.followUps) ? null : AIReplyUtil.createSession(ctx, result, nextHistory);

        const reply = await updater.finish(AIReplyUtil.renderResult(question, result, session));
        session?.setMessage(reply);

        return reply;
    },

    renderThinking: question => {
        const embed = new EmbedBuilder().setDescription(`${getEmoji("waiting")} Thinking...`);

        return {
            content: AIReplyUtil._formatQuestion(question),
            embeds: [embed],
            components: []
        };
    },

    renderProgress: (question, session) => {
        const lines = session.steps.map(
                step => `${AIReplyUtil._getStepEmoji(step.status)} ${AIReplyUtil._formatStep(step)}`
            ),
            embed = new EmbedBuilder().setDescription(lines.join("\n"));

        return {
            content: AIReplyUtil._formatQuestion(question),
            embeds: [embed],
            components: []
        };
    },

    renderResult: (question, result, session) => {
        const embed = new EmbedBuilder().setDescription(result.answer),
            textSources = result.sources.filter(source => HttpUtil.getHost(source) === null);

        if (!Util.empty(textSources)) {
            embed.addFields({ name: "Sources", value: textSources.map(source => `\`${source}\``).join(", ") });
        }

        if (result.image !== null) {
            embed.setImage(result.image);
        }

        embed.setFooter({ text: AIReplyUtil._formatFooter(result) });

        const config = getConfig(),
            trimmed = DiscordUtil.trimEmbed(embed, config.embedCharLimit, config.embedLineLimit);

        return {
            content: AIReplyUtil._formatQuestion(question),
            embeds: [trimmed],
            components: AIReplyUtil._createRows(result, session)
        };
    },

    formatError: err => {
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
    },

    createSession: (ctx, result, history) => {
        const session = new ComponentSession(ctx, {
            interactionMode: InteractionModes.anyone,
            spec: { followUps: result.followUps, history }
        });

        getClient().interactionHandler.registerSession(session);
        return session;
    },

    handleInteraction: async ctx => {
        const session = ctx.interactionContext.session,
            interaction = ctx.interaction;

        const [, action, idxText] = interaction.customId.split(":"),
            question = session.spec.followUps[Util.parseInt(idxText)];

        if (action !== AIReplyUtil.followUpAction || typeof question === "undefined") {
            return false;
        }

        await AIReplyUtil.answer(ctx, AIRequest.fromInteraction(interaction), question, session.spec.history);
        return true;
    },

    _formatQuestion: question => {
        return `> ${Util.trimString(question.replaceAll("\n", " "), AIReplyUtil.maxQuestionLength)}`;
    },

    _getStepEmoji: status => {
        switch (status) {
            case AIStepStatus.running:
                return getEmoji("waiting");
            case AIStepStatus.done:
                return getEmoji("ok");
            case AIStepStatus.failed:
                return getEmoji("warn");
        }
    },

    _formatStep: step => {
        const key = AIReplyUtil.stepArgKeys.find(argKey => typeof step.args[argKey] !== "undefined");

        if (typeof key === "undefined") {
            return `\`${step.tool}\``;
        }

        const arg = Util.trimString(String(step.args[key]).replaceAll("\n", " "), AIReplyUtil.maxArgLength);
        return `\`${step.tool}\` ${arg}`;
    },

    _formatFooter: result => {
        const tools = ArrayUtil.unique(result.steps.map(step => step.tool));
        return Util.empty(tools) ? result.model : `${result.model} • ${tools.join(", ")}`;
    },

    _createRows: (result, session) => {
        const rows = [];

        if (session !== null) {
            const buttons = result.followUps.map((followUp, i) =>
                new ButtonBuilder()
                    .setCustomId(`${AIReplyUtil.customIdPrefix}:${AIReplyUtil.followUpAction}:${i}:${session.id}`)
                    .setLabel(Util.trimString(followUp, AIReplyUtil.maxButtonLabelLength))
                    .setStyle(ButtonStyle.Secondary)
            );

            rows.push(new ActionRowBuilder().addComponents(buttons));
        }

        const links = result.sources.filter(source => HttpUtil.getHost(source) !== null);

        if (!Util.empty(links)) {
            const buttons = links.map(url =>
                new ButtonBuilder().setURL(url).setLabel(AIReplyUtil._getLinkLabel(url)).setStyle(ButtonStyle.Link)
            );

            rows.push(new ActionRowBuilder().addComponents(buttons));
        }

        return rows;
    },

    _getLinkLabel: url => {
        if (DiscordUtil.parseMessageUrl(url) !== null) {
            return "Message";
        }

        return HttpUtil.getHost(url).replace(AIReplyUtil._wwwRegex, "");
    }
});

export default AIReplyUtil;
