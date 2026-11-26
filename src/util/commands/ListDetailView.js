import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

import ComponentSession from "../../structures/interaction/ComponentSession.js";

import ObjectUtil from "../ObjectUtil.js";
import TypeTester from "../TypeTester.js";
import PaginationUtil from "./PaginationUtil.js";
import PickerUtil from "./PickerUtil.js";

class ListDetailView {
    static maxLimit = PickerUtil.maxOptions - PickerUtil.rowSize;
    static defaultBackLabel = "Back";

    static createPicker(renderItem, options) {
        options = ObjectUtil.guaranteeObject(options);

        const getLabel = options.getLabel ?? null,
            configuredLabel = options.backLabel ?? null;

        const onPick = (ctx, item) => {
            const backLabel =
                configuredLabel ?? ctx.interactionContext.session.spec?.backLabel ?? ListDetailView.defaultBackLabel;
            return ListDetailView._showItem(ctx, renderItem(item), backLabel);
        };

        return (items, session) => PickerUtil.prepareRows(session, items, onPick, { getLabel });
    }

    static async handleInteraction(ctx) {
        const { componentId } = ctx.interactionContext;

        switch (componentId.prefix) {
            case PickerUtil.customIdPrefix:
                return await PickerUtil.handleInteraction(ctx);
            case ListDetailView._backPrefix:
                if (componentId.action !== ListDetailView._backAction) {
                    return false;
                } else if (ctx.isAuthor) {
                    return await PaginationUtil.refresh(ctx);
                }

                await ctx.deferUpdate();
                return true;
            default:
                return await PaginationUtil.handleInteraction(ctx);
        }
    }

    static _backPrefix = "list";
    static _backAction = "back";

    static async _showItem(ctx, payload, backLabel = ListDetailView.defaultBackLabel) {
        if (TypeTester.isPromise(payload)) {
            const defer = ctx.isAuthor ? ctx.deferUpdate() : ctx.deferReply({ ephemeral: true });
            [payload] = await Promise.all([payload, defer]);
        }

        if (!ctx.isAuthor) {
            await ctx.reply(payload, { ephemeral: true });
            return true;
        }

        const session = ctx.interactionContext.session;

        const button = new ButtonBuilder()
            .setCustomId(
                ComponentSession.createCustomId(ListDetailView._backPrefix, ListDetailView._backAction, session.id)
            )
            .setLabel(backLabel)
            .setStyle(ButtonStyle.Primary);

        await ctx.update({
            content: "",
            embeds: [],
            files: [],
            attachments: [],
            ...payload,
            components: [new ActionRowBuilder().addComponents(button)]
        });

        return true;
    }
}

export default ListDetailView;
