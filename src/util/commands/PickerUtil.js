import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

import ComponentSession from "../../structures/interaction/ComponentSession.js";

import Util from "../Util.js";
import ArrayUtil from "../ArrayUtil.js";
import ObjectUtil from "../ObjectUtil.js";

import UtilError from "../../errors/UtilError.js";

function labelForOption(getLabel, item, i) {
    if (typeof getLabel !== "function") {
        return i + 1;
    }

    return getLabel(item, i);
}

class PickerUtil {
    static customIdPrefix = "pick";

    static rowSize = 5;
    static maxOptions = 5 * PickerUtil.rowSize;

    static prepareRows(session, items, onPick, options) {
        options = ObjectUtil.guaranteeObject(options);

        const getLabel = options.getLabel ?? null;

        if (items.length > PickerUtil.maxOptions) {
            throw new UtilError(`A picker supports at most ${PickerUtil.maxOptions} options.`);
        }

        const revision = ++PickerUtil._revision;

        const choices = new Map();

        const buttons = items.map((item, i) => {
            const id = ComponentSession.createCustomId(PickerUtil.customIdPrefix, i, session.id, revision);
            choices.set(id, item);

            return new ButtonBuilder()
                .setCustomId(id)
                .setLabel(String(labelForOption(getLabel, item, i)))
                .setStyle(ButtonStyle.Secondary);
        });

        const rows = ArrayUtil.split(buttons, (_, i) => Math.floor(i / PickerUtil.rowSize))
            .filter(row => !Util.empty(row))
            .map(row => new ActionRowBuilder().addComponents(row));

        const activate = () => PickerUtil._pickers.set(session, { choices, onPick });
        return { rows, activate };
    }

    static async handleInteraction(ctx) {
        const { interaction, session } = ctx.interactionContext,
            id = interaction.customId;

        const picker = PickerUtil._pickers.get(session);

        if (!picker.choices.has(id)) {
            await ctx.deferUpdate();
            return true;
        }

        await picker.onPick(ctx, picker.choices.get(id));
        return true;
    }

    static _pickers = new WeakMap();
    static _revision = 0;
}

export default PickerUtil;
