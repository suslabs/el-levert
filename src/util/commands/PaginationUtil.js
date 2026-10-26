import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from "discord.js";

import ComponentSession from "../../structures/interaction/ComponentSession.js";

import InteractionModes from "../../structures/interaction/InteractionModes.js";

import CommandReaderKinds from "../../parsers/command/reader/CommandReaderKinds.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../Util.js";
import TypeTester from "../TypeTester.js";
import ObjectUtil from "../ObjectUtil.js";
import DiscordUtil from "../DiscordUtil.js";
import CaseUtil from "../misc/CaseUtil.js";

function makePaginationArg(name, options) {
    return Object.freeze({
        name,
        kind: CommandReaderKinds.option,
        aliases: [CaseUtil.toKebabCase(name)],
        ...ObjectUtil.guaranteeObject(options)
    });
}

async function fetchPageData(spec, page, limit, ctx) {
    if (spec.initialData != null && (page === 1 || page === spec.initialData.page)) {
        const initial = spec.initialData,
            items = initial.items ?? (Array.isArray(initial) ? initial : []),
            totalCount = initial.totalCount ?? initial.total ?? initial.count ?? items.length;

        delete spec.initialData;

        return { items, totalCount };
    }

    if (Array.isArray(spec.items)) {
        const offset = (page - 1) * limit;

        return {
            items: spec.items.slice(offset, offset + limit),
            totalCount: spec.items.length
        };
    }

    if (typeof spec.fetch === "function") {
        const offset = (page - 1) * limit,
            fetchRes = await spec.fetch({ page, limit, offset }, ctx);

        if (fetchRes == null) {
            return { items: [], totalCount: 0 };
        }

        const items = fetchRes.items ?? (Array.isArray(fetchRes) ? fetchRes : []),
            totalCount = fetchRes.totalCount ?? fetchRes.total ?? fetchRes.count ?? items.length;

        return { items, totalCount };
    }

    return { items: [], totalCount: 0 };
}

function resolveTargetPage(action, currentPage, totalPages) {
    switch (action) {
        case "first":
            return 1;
        case "prev":
            return Math.max(1, currentPage - 1);
        case "next":
            return Math.min(totalPages, currentPage + 1);
        case "last":
            return totalPages;
        default:
            return null;
    }
}

async function handleRenderOverflow(rendered, items, spec, ctx) {
    if (!TypeTester.isObject(rendered)) {
        return rendered;
    }

    const embeds = rendered.embeds;

    if (Util.empty(embeds) || typeof spec.formatDump !== "function") {
        return rendered;
    }

    const embedLimits = ctx.handler != null ? ctx.handler.getLimits().embed : [DiscordUtil.embedCharLimit],
        isOversized = embeds.some(embed => DiscordUtil.embedOverSizeLimit(embed, ...embedLimits));

    if (!isOversized) {
        return rendered;
    }

    const dump = await spec.formatDump(items, false, ctx),
        filename = spec.filename ?? "page.txt";

    const header = rendered.content ?? spec.dumpHeader ?? spec.header ?? `${getEmoji("info")} Results:`;

    return {
        content: header,
        ...DiscordUtil.getFileAttach(dump, filename)
    };
}

async function renderPage(spec, page, ctx) {
    const data = await fetchPageData(spec, page, ctx.pageSize, ctx),
        items = data.items,
        totalCount = data.totalCount;

    let rendered = await spec.render(items, { page, totalPages: ctx.totalPages, totalCount }, ctx);
    rendered = await handleRenderOverflow(rendered, items, spec, ctx);

    return { rendered, items, totalCount };
}

function formatRendered(rendered) {
    if (typeof rendered === "string") {
        return { content: rendered };
    }

    return ObjectUtil.guaranteeObject(rendered);
}

async function showJumpModal(interaction, sessionId, totalPages) {
    const modal = new ModalBuilder().setCustomId(`page:modal:${sessionId}`).setTitle("Jump to Page");

    const pageInput = new TextInputBuilder()
        .setCustomId("page_number")
        .setLabel(`Page Number (1-${totalPages})`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Enter page number (1-${totalPages})`)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(String(totalPages).length);

    const row = new ActionRowBuilder().addComponents(pageInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
    return true;
}

function resolveInteractionTargetPage(interaction, action, currentPage, totalPages) {
    if (action === "modal" || interaction.isModalSubmit()) {
        const pageStr = interaction.fields.getTextInputValue("page_number").trim(),
            parsedPage = Util.parseInt(pageStr);

        if (Number.isNaN(parsedPage)) {
            return null;
        }

        return Util.clamp(parsedPage, 1, totalPages);
    }

    return resolveTargetPage(action, currentPage, totalPages);
}

async function delegateEphemeralPagination(ctx, interaction, targetPage, spec) {
    const newCtx = ctx.clone({
        author: interaction.user,
        user: interaction.user,
        isAuthor: true,
        ephemeral: true,
        options: {
            ...ctx.options,
            page: targetPage
        }
    });

    newCtx.page = targetPage;
    newCtx.arg = name => {
        if (name === (spec.pageName ?? "page") || name === "page" || name === "p") {
            return targetPage;
        }

        if (typeof ctx.arg === "function") {
            return ctx.arg(name);
        }

        return null;
    };

    await PaginationUtil.paginate(newCtx, spec);
    return true;
}

async function updateAuthorPage(ctx, session, targetPage, totalPages, spec) {
    session.page = targetPage;
    ctx.page = targetPage;

    if (session.context != null) {
        session.context.page = targetPage;
    }

    const pageRes = await renderPage(spec, targetPage, ctx),
        pageRendered = formatRendered(pageRes.rendered);

    const row = PaginationUtil.createPaginationRow(session.id, targetPage, totalPages, false);
    await ctx.update({ ...pageRendered, components: [row] });

    return true;
}

const PaginationUtil = Object.freeze({
    getPaginationArguments: (options = {}) => {
        options = ObjectUtil.guaranteeObject(options);

        const defaultLimit = options.defaultLimit ?? 10,
            pageName = options.pageName ?? "page",
            limitName = options.limitName ?? "limit",
            allName = options.allName ?? "all";

        return [
            makePaginationArg(pageName, {
                shorthand: "p",
                aliases: ["p"],
                type: "integer"
            }),
            makePaginationArg(limitName, {
                shorthand: "l",
                aliases: ["l"],
                type: "integer",
                defaultValue: defaultLimit
            }),
            makePaginationArg(allName, {
                shorthand: "a",
                aliases: ["a"],
                type: "boolean"
            })
        ];
    },

    getPaginationOptions: (ctx, options = {}) => {
        options = ObjectUtil.guaranteeObject(options);

        const pageName = options.pageName ?? "page",
            limitName = options.limitName ?? "limit",
            allName = options.allName ?? "all";

        const defaultLimit = options.defaultLimit ?? 10,
            maxLimit = options.maxLimit ?? 50;

        const hasArg = typeof ctx.arg === "function",
            rawAll = hasArg ? (ctx.arg(allName) ?? ctx.arg("all")) : null,
            commandName = ctx.commandName ?? "";

        const all =
            Boolean(rawAll) || options.all === true || commandName.endsWith("all") || commandName.endsWith("_all");

        const rawLimit =
                options.limit ?? (hasArg ? (ctx.arg(limitName) ?? ctx.arg("limit") ?? defaultLimit) : defaultLimit),
            limit = Util.clamp(rawLimit, 1, maxLimit);

        const rawPage = options.page ?? (hasArg ? (ctx.arg(pageName) ?? ctx.arg("page") ?? 1) : 1),
            page = Math.max(1, rawPage),
            offset = options.offset ?? (page - 1) * limit;

        return { page, limit, offset, all };
    },

    createPaginationRow: (sessionId, page, totalPages, disabled = false) => {
        const atStart = page <= 1 || totalPages <= 1 || disabled,
            atEnd = page >= totalPages || totalPages <= 1 || disabled,
            jumpDisabled = totalPages <= 1 || disabled;

        const firstButton = new ButtonBuilder()
            .setCustomId(`page:first:${sessionId}`)
            .setEmoji("⏮️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(atStart);

        const prevButton = new ButtonBuilder()
            .setCustomId(`page:prev:${sessionId}`)
            .setEmoji("◀️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(atStart);

        const jumpButton = new ButtonBuilder()
            .setCustomId(`page:jump:${sessionId}`)
            .setLabel(`${page} / ${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(jumpDisabled);

        const nextButton = new ButtonBuilder()
            .setCustomId(`page:next:${sessionId}`)
            .setEmoji("▶️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(atEnd);

        const lastButton = new ButtonBuilder()
            .setCustomId(`page:last:${sessionId}`)
            .setEmoji("⏭️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(atEnd);

        return new ActionRowBuilder().addComponents(firstButton, prevButton, jumpButton, nextButton, lastButton);
    },

    paginate: async (ctx, spec) => {
        spec = ObjectUtil.guaranteeObject(spec);
        const paginationOpts = PaginationUtil.getPaginationOptions(ctx, spec);

        if (paginationOpts.all) {
            return await PaginationUtil.dumpAll(ctx, spec);
        }

        let page = paginationOpts.page,
            limit = paginationOpts.limit;

        ctx.pageSize = limit;

        const data = await fetchPageData(spec, page, limit, ctx);

        const items = data.items,
            totalCount = data.totalCount;

        if (totalCount === 0 || Util.empty(items)) {
            const emptyMsg = spec.emptyMessage ?? `${getEmoji("info")} Found no results.`;

            if (ctx.isInteraction) {
                return await ctx.reply(emptyMsg, ctx.ephemeral ? { ephemeral: true } : {});
            }

            return emptyMsg;
        }

        const totalPages = Math.max(1, Math.ceil(totalCount / limit));
        page = Util.clamp(page, 1, totalPages);

        ctx.page = page;
        ctx.totalPages = totalPages;
        ctx.totalCount = totalCount;

        let rendered = await spec.render(items, { page, totalPages, totalCount }, ctx);
        rendered = await handleRenderOverflow(rendered, items, spec, ctx);

        if (totalPages <= 1) {
            if (ctx.isInteraction) {
                return await ctx.reply(rendered, ctx.ephemeral ? { ephemeral: true } : {});
            }

            return rendered;
        }

        const session = new ComponentSession(ctx, {
            interactionMode: ctx.ephemeral
                ? InteractionModes.authorOnly
                : (spec.interactionMode ?? InteractionModes.ephemeralOthers),
            timeout: spec.timeout,
            spec
        });

        session.page = page;
        session.totalPages = totalPages;
        session.pageSize = limit;
        session.totalCount = totalCount;
        session.spec = spec;

        if (spec.window != null) {
            session.window = spec.window;
        }

        const client = getClient(),
            handler = client != null ? client.interactionHandler : null;

        if (handler != null) {
            handler.registerSession(session);
        }

        ctx.paginationSession = session;
        ctx.paginationSpec = spec;

        const row = PaginationUtil.createPaginationRow(session.id, page, totalPages, false),
            payload = formatRendered(rendered);

        const reply = await ctx.reply(
            {
                ...payload,
                components: [row]
            },
            ctx.ephemeral ? { ephemeral: true } : {}
        );

        session.setMessage(reply);
        return reply;
    },

    handleInteraction: async ctx => {
        const session = ctx.paginationSession ?? ctx.interactionContext?.session;

        if (session == null) {
            return false;
        }

        const spec = ctx.paginationSpec ?? session.spec,
            interaction = ctx.interactionContext?.interaction ?? ctx.interaction;

        if (spec == null || interaction == null) {
            return false;
        }

        const isAuthor = ctx.isAuthor || session.interactionMode === InteractionModes.anyone;

        const customParts = interaction.customId.split(":"),
            action = customParts[1];

        const totalPages = session.totalPages,
            currentPage = session.page;

        if (action === "jump") {
            return await showJumpModal(interaction, session.id, totalPages);
        }

        const targetPage = resolveInteractionTargetPage(interaction, action, currentPage, totalPages);

        if (targetPage === null || (targetPage === currentPage && isAuthor)) {
            if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                await interaction.deferUpdate();
            }

            return true;
        }

        if (!isAuthor) {
            return await delegateEphemeralPagination(ctx, interaction, targetPage, spec);
        }

        return await updateAuthorPage(ctx, session, targetPage, totalPages, spec);
    },

    dumpAll: async (ctx, spec) => {
        spec = ObjectUtil.guaranteeObject(spec);

        let items = [];

        if (Array.isArray(spec.items)) {
            items = spec.items;
        } else if (typeof spec.fetch === "function") {
            const res = await spec.fetch(
                {
                    page: 1,
                    limit: Infinity,
                    offset: 0,
                    all: true
                },
                ctx
            );

            items = res.items ?? [];
        }

        if (Util.empty(items)) {
            return spec.emptyMessage ?? `${getEmoji("info")} Found no results.`;
        }

        if (typeof spec.formatDump !== "function") {
            return `${getEmoji("info")} Found ${items.length} results.`;
        }

        const header = spec.dumpHeader ?? spec.header ?? `${getEmoji("info")} Full export:`;

        let dump = await spec.formatDump(items, true, ctx);

        if (typeof dump !== "string") {
            return dump;
        }

        const embedLimits = ctx.handler != null ? ctx.handler.getLimits().embed : [DiscordUtil.embedCharLimit],
            isOversized = Util.overSizeLimits(dump, ...embedLimits);

        if (!isOversized) {
            return {
                content: header,
                embeds: [new EmbedBuilder().setDescription(dump)]
            };
        }

        dump = await spec.formatDump(items, false, ctx);
        const filename = spec.filename ?? "dump.txt";

        return {
            content: header,
            ...DiscordUtil.getFileAttach(dump, filename)
        };
    }
});

export default PaginationUtil;
