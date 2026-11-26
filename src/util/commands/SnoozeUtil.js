import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from "discord.js";

import ComponentSession from "../../structures/interaction/ComponentSession.js";

import InteractionModes from "../../structures/interaction/InteractionModes.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../Util.js";
import IntervalUtil from "../date/IntervalUtil.js";

class SnoozeUtil {
    static createSession(user, reminder) {
        const client = getClient(),
            command = client.commandManager.searchCommands("reminder").subcmds.get("snooze"),
            ctx = command.createContext({ author: user });

        const session = new ComponentSession(ctx, {
            interactionMode: InteractionModes.authorOnly,
            spec: { reminder }
        });

        client.interactionHandler.registerSession(session);
        return session;
    }

    static createSnoozeRow(sessionId) {
        const buttons = Array.from(SnoozeUtil._presets.keys(), duration =>
            SnoozeUtil._createButton(sessionId, duration, duration, ButtonStyle.Secondary)
        );

        const custom = SnoozeUtil._createButton(sessionId, SnoozeUtil._customAction, "Custom", ButtonStyle.Primary);
        return new ActionRowBuilder().addComponents(...buttons, custom);
    }

    static async handleInteraction(ctx) {
        const { componentId, interaction, session } = ctx.interactionContext;

        if (componentId.prefix !== SnoozeUtil._prefix) {
            return false;
        }

        const { action } = componentId;

        const isModal = interaction.isModalSubmit();

        if (action === SnoozeUtil._customAction && !isModal) {
            await SnoozeUtil._showModal(interaction, session.id);
            return true;
        }

        let duration;

        if (action === SnoozeUtil._modalAction && isModal) {
            const input = interaction.fields.getTextInputValue(SnoozeUtil._durationField);
            duration = IntervalUtil.parse(input);

            if (duration === null) {
                await ctx.reply(`${getEmoji("warn")} Invalid duration: \`${input}\`.`, { ephemeral: true });
                return true;
            }
        } else if (!isModal && SnoozeUtil._presets.has(action)) {
            duration = SnoozeUtil._presets.get(action);
        } else {
            return false;
        }

        const snoozed = await getClient().reminderManager.snooze(interaction.user.id, session.spec.reminder, duration);
        await session.destroy(true);

        const content = `${getEmoji("info")} Reminder snoozed until ${snoozed.format(false)}.`;

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content, ephemeral: true });
        } else {
            await interaction.reply({ content, ephemeral: true });
        }

        return true;
    }

    static _prefix = "snooze";
    static _customAction = "custom";
    static _modalAction = "modal";
    static _durationField = "duration";

    static _presets = new Map([
        ["5m", (5 * Util.durationSeconds.minute) / Util.durationSeconds.milli],
        ["15m", (15 * Util.durationSeconds.minute) / Util.durationSeconds.milli],
        ["1h", Util.durationSeconds.hour / Util.durationSeconds.milli]
    ]);

    static _createButton(sessionId, action, label, style) {
        return new ButtonBuilder()
            .setCustomId(ComponentSession.createCustomId(SnoozeUtil._prefix, action, sessionId))
            .setLabel(label)
            .setStyle(style);
    }

    static async _showModal(interaction, sessionId) {
        const input = new TextInputBuilder()
            .setCustomId(SnoozeUtil._durationField)
            .setLabel("Snooze duration (e.g. 10m, 2h, 1d)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("e.g. 10m, 2h, 1d")
            .setRequired(true);

        const modal = new ModalBuilder()
            .setCustomId(ComponentSession.createCustomId(SnoozeUtil._prefix, SnoozeUtil._modalAction, sessionId))
            .setTitle("Snooze Reminder")
            .addComponents(new ActionRowBuilder().addComponents(input));

        await interaction.showModal(modal);
    }
}

export default SnoozeUtil;
