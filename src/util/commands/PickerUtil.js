import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

import ComponentSession from "../../structures/interaction/ComponentSession.js";

import { getClient } from "../../LevertClient.js";

import Util from "../Util.js";
import ArrayUtil from "../ArrayUtil.js";
import ObjectUtil from "../ObjectUtil.js";
import TypeTester from "../TypeTester.js";
import PaginationUtil from "./PaginationUtil.js";

const PickerUtil = Object.freeze({
    customIdPrefix: "pick",
    backAction: "back",

    rowSize: 5,
    defaultPageSize: 10,
    defaultBackLabel: "Back",

    _createRows: buttons => {
        return ArrayUtil.split(buttons, (_, i) => Math.floor(i / PickerUtil.rowSize))
            .filter(row => !Util.empty(row))
            .map(row => new ActionRowBuilder().addComponents(row));
    },

    _createItemRows: (session, items) => {
        const spec = session.spec;

        const buttons = items.map(item =>
            new ButtonBuilder()
                .setCustomId(
                    ComponentSession.createCustomId(PickerUtil.customIdPrefix, spec.items.indexOf(item), session.id)
                )
                .setLabel(String(spec.getLabel(item)))
                .setStyle(ButtonStyle.Secondary)
        );

        return PickerUtil._createRows(buttons);
    },

    _createBackRow: session => {
        const button = new ButtonBuilder()
            .setCustomId(ComponentSession.createCustomId(PickerUtil.customIdPrefix, PickerUtil.backAction, session.id))
            .setLabel(session.spec.backLabel ?? PickerUtil.defaultBackLabel)
            .setStyle(ButtonStyle.Primary);

        return new ActionRowBuilder().addComponents(button);
    },

    _renderList: (session, items, info) => {
        const payload = ObjectUtil.guaranteeObject(session.spec.renderList(items, info));

        session.listItems = items;
        session.listInfo = info;

        return {
            ...payload,
            components: [...(payload.components ?? []), ...PickerUtil._createItemRows(session, items)]
        };
    },

    pick: async (ctx, spec) => {
        spec = ObjectUtil.guaranteeObject(spec);

        const session = new ComponentSession(ctx, { spec });
        getClient().interactionHandler.registerSession(session);

        const out = await PaginationUtil.paginate(ctx, {
            items: spec.items,
            defaultLimit: spec.pageSize ?? PickerUtil.defaultPageSize,
            render: (items, info) => PickerUtil._renderList(session, items, info),

            dumpHeader: spec.dumpHeader,
            formatDump: spec.formatDump,
            filename: spec.filename
        });

        session.paginationSession = ctx.paginationSession ?? null;
        return out;
    },

    _toUpdate: payload => {
        return { content: "", embeds: [], files: [], attachments: [], ...payload };
    },

    _showItem: async (ctx, session, idx) => {
        let rendered = session.spec.renderItem(session.spec.items[idx]);

        if (TypeTester.isPromise(rendered)) {
            const defer = ctx.isAuthor ? ctx.deferUpdate() : ctx.deferReply({ ephemeral: true });
            [rendered] = await Promise.all([rendered, defer]);
        }

        const payload = ObjectUtil.guaranteeObject(rendered);

        if (!ctx.isAuthor) {
            await ctx.reply(payload, { ephemeral: true });
            return true;
        }

        await ctx.update(PickerUtil._toUpdate({ ...payload, components: [PickerUtil._createBackRow(session)] }));
        return true;
    },

    _showList: async (ctx, session) => {
        const info = session.listInfo,
            payload = PickerUtil._renderList(session, session.listItems, info);

        const paginationSession = session.paginationSession;

        if (paginationSession !== null && info.totalPages > 1) {
            payload.components.push(
                PaginationUtil.createPaginationRow(paginationSession.id, info.page, info.totalPages, false)
            );
        }

        await ctx.update(PickerUtil._toUpdate(payload));
        return true;
    },

    handleInteraction: async ctx => {
        const parsed = ComponentSession.parseCustomId(ctx.interaction.customId);

        if (parsed?.prefix !== PickerUtil.customIdPrefix) {
            return await PaginationUtil.handleInteraction(ctx);
        }

        const session = ctx.interactionContext.session;

        if (parsed.action === PickerUtil.backAction) {
            return await PickerUtil._showList(ctx, session);
        }

        return await PickerUtil._showItem(ctx, session, Util.parseInt(parsed.action));
    }
});

export default PickerUtil;
