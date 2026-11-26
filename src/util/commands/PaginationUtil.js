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
import ArrayUtil from "../ArrayUtil.js";
import DiscordUtil from "../DiscordUtil.js";
import ObjectUtil from "../ObjectUtil.js";
import TypeTester from "../TypeTester.js";
import CaseUtil from "../misc/CaseUtil.js";

import UtilError from "../../errors/UtilError.js";

function makePaginationArg(name, options) {
    options = ObjectUtil.guaranteeObject(options);

    const kebab = CaseUtil.toKebabCase(name),
        aliases = ArrayUtil.unique([...(options.aliases ?? []), ...(kebab === name ? [] : [kebab])]);

    return Object.freeze({
        name,
        kind: CommandReaderKinds.option,
        ...options,
        ...(Util.empty(aliases) ? {} : { aliases })
    });
}

function readPaginationArg(ctx, name) {
    if (typeof ctx.parseArgs === "function") {
        const { results } = ctx.parseArgs();

        if (results.has(name)) {
            return results.get(name).value;
        }
    }

    return typeof ctx.arg === "function" ? ctx.arg(name) : undefined;
}

function extractPageResult(result) {
    if (result == null) {
        return { items: [], totalCount: 0 };
    }

    const items = Array.isArray(result) ? result : (result.items ?? result.results ?? []),
        totalCount = result.totalCount ?? result.total ?? result.count ?? items.length;

    return { items, totalCount };
}

async function fetchPageData(spec, request, ctx) {
    const items = spec.items ?? null;

    if (items !== null) {
        const { offset, limit } = request;
        return {
            items: items.slice(offset, offset + limit),
            totalCount: items.length
        };
    }

    const fetch = spec.fetch;

    if (typeof fetch !== "function") {
        return { items: [], totalCount: 0 };
    }

    return extractPageResult(await fetch(request, ctx));
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

    const embedLimits = ctx.handler?.getLimits().embed ?? [DiscordUtil.embedCharLimit],
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

async function renderPage(ctx, spec, items, info) {
    const render = spec.render;

    if (typeof render !== "function") {
        throw new UtilError("Pagination requires a page renderer.");
    }

    const rendered = await render(items, info, ctx);
    return await handleRenderOverflow(rendered, items, spec, ctx);
}

function formatRendered(rendered) {
    if (typeof rendered === "string") {
        return { content: rendered };
    }

    return ObjectUtil.guaranteeObject(rendered);
}

function resolveInteractionTargetPage(interaction, action, currentPage, totalPages) {
    if (interaction.isModalSubmit()) {
        if (action !== "modal") {
            return null;
        }

        const pageStr = interaction.fields.getTextInputValue("page_number").trim(),
            parsedPage = Util.parseInt(pageStr);

        if (Number.isNaN(parsedPage)) {
            return null;
        }

        return Util.clamp(parsedPage, 1, totalPages);
    }

    return resolveTargetPage(action, currentPage, totalPages);
}

class PaginationUtil {
    static customIdPrefix = "page";
    static defaultLimit = 10;

    static getPaginationArguments(options = {}) {
        options = ObjectUtil.guaranteeObject(options);

        const defaultLimit = options.defaultLimit ?? PaginationUtil.defaultLimit,
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
    }

    static getPaginationOptions(ctx, options = {}) {
        options = ObjectUtil.guaranteeObject(options);

        const pageName = options.pageName ?? "page",
            limitName = options.limitName ?? "limit",
            allName = options.allName ?? "all",
            defaultLimit = options.defaultLimit ?? PaginationUtil.defaultLimit,
            maxLimit = options.maxLimit ?? 50;

        const rawAll = readPaginationArg(ctx, allName) ?? readPaginationArg(ctx, "all"),
            commandName = ctx.commandName ?? "";

        const all =
            Boolean(rawAll) || options.all === true || commandName.endsWith("all") || commandName.endsWith("_all");

        const rawLimit =
                options.limit ?? readPaginationArg(ctx, limitName) ?? readPaginationArg(ctx, "limit") ?? defaultLimit,
            limit = Util.clamp(Number.isFinite(rawLimit) ? rawLimit : defaultLimit, 1, maxLimit);

        const rawPage = options.page ?? readPaginationArg(ctx, pageName) ?? readPaginationArg(ctx, "page") ?? 1,
            page = Math.max(1, Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1),
            offset = options.offset ?? (page - 1) * limit;

        return { page, limit, offset, all };
    }

    static createPaginationRow(sessionId, page, totalPages, disabled = false) {
        const atStart = page <= 1 || totalPages <= 1 || disabled,
            atEnd = page >= totalPages || totalPages <= 1 || disabled,
            jumpDisabled = totalPages <= 1 || disabled;

        const firstButton = PaginationUtil._createButton(sessionId, "first", atStart).setEmoji("⏮️"),
            prevButton = PaginationUtil._createButton(sessionId, "prev", atStart).setEmoji("◀️"),
            jumpButton = PaginationUtil._createButton(sessionId, "jump", jumpDisabled).setLabel(
                `${page} / ${totalPages}`
            ),
            nextButton = PaginationUtil._createButton(sessionId, "next", atEnd).setEmoji("▶️"),
            lastButton = PaginationUtil._createButton(sessionId, "last", atEnd).setEmoji("⏭️");

        return new ActionRowBuilder().addComponents(firstButton, prevButton, jumpButton, nextButton, lastButton);
    }

    static async paginate(ctx, spec) {
        spec = ObjectUtil.guaranteeObject(spec);
        const paginationOpts = PaginationUtil.getPaginationOptions(ctx, spec);

        if (paginationOpts.all) {
            return await PaginationUtil.dumpAll(ctx, spec);
        }

        let { page, limit, offset } = paginationOpts;

        if (Array.isArray(spec.items) && !Util.empty(spec.items)) {
            page = Util.clamp(page, 1, Math.max(1, Math.ceil(spec.items.length / limit)));
            offset = (page - 1) * limit;
        }

        ctx.pageSize = limit;

        const initial = spec.initialData ?? null;
        let data;

        if (initial?.page === page) {
            data = extractPageResult(initial);
        } else {
            data = await fetchPageData(spec, { page, limit, offset }, ctx);
        }

        let { items, totalCount } = data,
            totalPages = Math.max(1, Math.ceil(totalCount / limit));

        if (totalCount > 0 && Util.empty(items) && page > totalPages) {
            page = totalPages;
            offset = (page - 1) * limit;
            ({ items, totalCount } = await fetchPageData(spec, { page, limit, offset }, ctx));
            totalPages = Math.max(1, Math.ceil(totalCount / limit));
        }

        page = Util.clamp(page, 1, totalPages);

        if (totalCount === 0 || Util.empty(items)) {
            const emptyMsg = spec.emptyMessage ?? `${getEmoji("info")} Found no results.`;

            if (ctx.isInteraction) {
                return await ctx.reply(emptyMsg, ctx.ephemeral ? { ephemeral: true } : {});
            }

            return emptyMsg;
        }

        ctx.page = page;
        ctx.totalPages = totalPages;
        ctx.totalCount = totalCount;

        const rendered = await renderPage(ctx, spec, items, { page, totalPages, totalCount });

        if (totalPages <= 1 && typeof spec.controls !== "function") {
            if (ctx.isInteraction) {
                return await ctx.reply(rendered, ctx.ephemeral ? { ephemeral: true } : {});
            }

            return rendered;
        }

        const timeout = spec.timeout ?? null,
            mode = spec.interactionMode ?? InteractionModes.ephemeralOthers,
            interactionMode = ctx.ephemeral ? InteractionModes.authorOnly : mode;

        const sessionSpec = { ...spec };
        delete sessionSpec.initialData;

        const session = new ComponentSession(ctx, { interactionMode, timeout, spec: sessionSpec });

        session.page = page;
        session.totalPages = totalPages;
        session.pageSize = limit;
        session.totalCount = totalCount;
        session.window = spec.window ?? null;

        const { payload, activate } = PaginationUtil._preparePage(rendered, items, session);
        activate?.();

        const handler = getClient().interactionHandler;
        handler.registerSession(session);

        ctx.paginationSession = session;
        ctx.paginationSpec = sessionSpec;

        if (totalPages <= 1 && !ctx.isInteraction) {
            return payload;
        }

        try {
            const reply = await ctx.reply(payload, ctx.ephemeral ? { ephemeral: true } : {});
            session.setMessage(reply);

            return reply;
        } catch (err) {
            handler.unregisterSession(session.id);
            throw err;
        }
    }

    static async refresh(ctx) {
        const session = ctx.interactionContext.session;
        return await PaginationUtil._updateAuthorPage(ctx, session, session.page);
    }

    static async handleInteraction(ctx) {
        const { componentId, interaction, session } = ctx.interactionContext;

        if (componentId.prefix !== PaginationUtil.customIdPrefix) {
            return false;
        }

        const canUpdate = ctx.isAuthor || session.interactionMode === InteractionModes.anyone;

        const { action } = componentId,
            { page, totalPages } = session;

        if (action === "jump" && !interaction.isModalSubmit()) {
            return await PaginationUtil._showJumpModal(interaction, session.id, totalPages);
        }

        const targetPage = resolveInteractionTargetPage(interaction, action, page, totalPages);

        if (targetPage === null || (targetPage === page && canUpdate)) {
            if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                await interaction.deferUpdate();
            }

            return true;
        }

        if (!canUpdate) {
            return await PaginationUtil._delegateEphemeralPagination(ctx, interaction, targetPage, session.spec);
        }

        return await PaginationUtil._updateAuthorPage(ctx, session, targetPage);
    }

    static async dumpAll(ctx, spec) {
        spec = ObjectUtil.guaranteeObject(spec);

        const { items } = await fetchPageData(spec, { page: 1, limit: Infinity, offset: 0, all: true }, ctx);

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

        const embedLimits = ctx.handler?.getLimits().embed ?? [DiscordUtil.embedCharLimit],
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

    static _createButton(sessionId, action, disabled) {
        return new ButtonBuilder()
            .setCustomId(ComponentSession.createCustomId(PaginationUtil.customIdPrefix, action, sessionId))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled);
    }

    static _preparePage(rendered, items, session, page = session.page) {
        const controls = session.spec.controls,
            extra = typeof controls === "function" ? controls(items, session) : null;

        const payload = formatRendered(rendered),
            components = [...(payload.components ?? []), ...(extra?.rows ?? [])];

        if (session.totalPages > 1) {
            components.push(PaginationUtil.createPaginationRow(session.id, page, session.totalPages));
        }

        return { payload: { ...payload, components }, activate: extra?.activate ?? null };
    }

    static async _showJumpModal(interaction, sessionId, totalPages) {
        const modal = new ModalBuilder()
            .setCustomId(ComponentSession.createCustomId(PaginationUtil.customIdPrefix, "modal", sessionId))
            .setTitle("Jump to Page");

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

    static async _delegateEphemeralPagination(ctx, interaction, targetPage, spec) {
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

        if (typeof ctx.arg === "function") {
            newCtx.arg = name => {
                if (name === (spec.pageName ?? "page") || name === "page" || name === "p") {
                    return targetPage;
                }

                return ctx.arg(name);
            };
        }

        await PaginationUtil.paginate(newCtx, { ...spec, page: targetPage });
        return true;
    }

    static async _updateAuthorPage(ctx, session, targetPage) {
        const spec = session.spec;

        const { pageSize, totalPages } = session;
        ctx.paginationSession = session;
        ctx.paginationSpec = spec;
        ctx.pageSize = pageSize;

        const offset = (targetPage - 1) * pageSize,
            { items, totalCount } = await fetchPageData(spec, { page: targetPage, limit: pageSize, offset }, ctx);

        ctx.page = targetPage;
        ctx.totalPages = totalPages;
        ctx.totalCount = totalCount;

        const rendered = await renderPage(ctx, spec, items, {
                page: targetPage,
                totalPages,
                totalCount
            }),
            { payload, activate } = PaginationUtil._preparePage(rendered, items, session, targetPage);

        await ctx.update({ content: "", embeds: [], files: [], attachments: [], components: [], ...payload });

        activate?.();
        session.page = targetPage;

        if (session.context != null) {
            session.context.page = targetPage;
        }

        return true;
    }
}

export default PaginationUtil;
