import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from "discord.js";

import ComponentSession from "../../structures/interaction/ComponentSession.js";

import { InteractionModes } from "../../structures/interaction/InteractionModes.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../Util.js";
import DateUtil from "./DateUtil.js";

let SnoozeUtil = {
    createSnoozeRow: sessionId => {
        const snooze5m = new ButtonBuilder()
                .setCustomId(`snooze:5m:${sessionId}`)
                .setLabel("5m")
                .setStyle(ButtonStyle.Secondary),
            snooze15m = new ButtonBuilder()
                .setCustomId(`snooze:15m:${sessionId}`)
                .setLabel("15m")
                .setStyle(ButtonStyle.Secondary),
            snooze1h = new ButtonBuilder()
                .setCustomId(`snooze:1h:${sessionId}`)
                .setLabel("1h")
                .setStyle(ButtonStyle.Secondary),
            snoozeCustom = new ButtonBuilder()
                .setCustomId(`snooze:custom:${sessionId}`)
                .setLabel("Custom")
                .setStyle(ButtonStyle.Secondary);

        return new ActionRowBuilder().addComponents(snooze5m, snooze15m, snooze1h, snoozeCustom);
    },

    createSession: (user, reminder) => {
        const snoozeCmd = getClient().commandManager.searchCommands("reminder").subcmds.get("snooze");

        const session = new ComponentSession(
            {
                author: user,
                command: snoozeCmd
            },
            {
                interactionMode: InteractionModes.authorOnly,
                spec: { reminder }
            }
        );

        const handler = getClient().interactionHandler;

        if (handler != null) {
            handler.registerSession(session);
        }

        return session;
    },

    handleInteraction: async ctx => {
        const session = ctx.paginationSession ?? ctx.interactionContext?.session;

        if (session == null) {
            return false;
        }

        const reminder = session.spec?.reminder;

        if (reminder == null) {
            return false;
        }

        const interaction = ctx.interactionContext?.interaction ?? ctx.interaction;

        if (interaction == null) {
            return false;
        }

        const parts = interaction.customId.split(":"),
            action = parts[1];

        if (action === "custom") {
            const modal = new ModalBuilder().setCustomId(`snooze:modal:${session.id}`).setTitle("Snooze Reminder");

            const durationInput = new TextInputBuilder()
                .setCustomId("duration")
                .setLabel("Snooze duration (e.g. 10m, 2h, 1d)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(durationInput);
            modal.addComponents(row);

            await interaction.showModal(modal);
            return true;
        }

        let duration = null;

        if (action === "5m") {
            duration = (5 * Util.durationSeconds.minute) / Util.durationSeconds.milli;
        } else if (action === "15m") {
            duration = (15 * Util.durationSeconds.minute) / Util.durationSeconds.milli;
        } else if (action === "1h") {
            duration = Util.durationSeconds.hour / Util.durationSeconds.milli;
        } else if (action === "modal") {
            const durationStr = interaction.fields.getTextInputValue("duration");
            duration = DateUtil.parseInterval(durationStr);

            if (duration === null || duration <= 0) {
                await interaction.reply({
                    content: `${getEmoji("warn")} Invalid duration: \`${durationStr}\`.`,
                    ephemeral: true
                });

                return true;
            }
        } else {
            return false;
        }

        const snoozed = await getClient().reminderManager.snooze(interaction.user.id, reminder, duration);
        await session.destroy(true);

        const format = snoozed.format(),
            content = `${getEmoji("info")} Reminder snoozed until ${format}${format.endsWith('"') ? "" : "."}`;

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content, ephemeral: true });
        } else {
            await interaction.reply({ content, ephemeral: true });
        }

        return true;
    }
};

SnoozeUtil = Object.freeze(SnoozeUtil);
export default SnoozeUtil;
