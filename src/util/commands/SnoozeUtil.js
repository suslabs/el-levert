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
import DateUtil from "../misc/DateUtil.js";

let SnoozeUtil = {
    customIdPrefix: "snooze",

    createSnoozeRow: sessionId => {
        const snooze5m = new ButtonBuilder()
                .setCustomId(ComponentSession.createCustomId(SnoozeUtil.customIdPrefix, "5m", sessionId))
                .setLabel("5m")
                .setStyle(ButtonStyle.Secondary),
            snooze15m = new ButtonBuilder()
                .setCustomId(ComponentSession.createCustomId(SnoozeUtil.customIdPrefix, "15m", sessionId))
                .setLabel("15m")
                .setStyle(ButtonStyle.Secondary),
            snooze1h = new ButtonBuilder()
                .setCustomId(ComponentSession.createCustomId(SnoozeUtil.customIdPrefix, "1h", sessionId))
                .setLabel("1h")
                .setStyle(ButtonStyle.Secondary),
            snoozeCustom = new ButtonBuilder()
                .setCustomId(ComponentSession.createCustomId(SnoozeUtil.customIdPrefix, "custom", sessionId))
                .setLabel("Custom")
                .setStyle(ButtonStyle.Secondary);

        return new ActionRowBuilder().addComponents(snooze5m, snooze15m, snooze1h, snoozeCustom);
    },

    createSession: (user, reminder) => {
        const snoozeCmd = getClient().commandManager.searchCommands("reminder").subcmds.get("snooze"),
            ctx = snoozeCmd.createContext({ author: user });

        const session = new ComponentSession(ctx, {
            interactionMode: InteractionModes.authorOnly,
            spec: { reminder }
        });

        ctx.snoozeSession = session;

        const handler = getClient().interactionHandler;

        if (handler != null) {
            handler.registerSession(session);
        }

        return session;
    },

    handleInteraction: async ctx => {
        const session = ctx.snoozeSession ?? ctx.interactionContext?.session,
            reminder = session?.spec?.reminder,
            interaction = ctx.interaction;

        if (session == null || reminder == null || interaction == null) {
            return false;
        }

        const action = ComponentSession.parseCustomId(interaction.customId)?.action;

        let duration = null;

        switch (action) {
            case "custom":
                const modal = new ModalBuilder()
                    .setCustomId(ComponentSession.createCustomId(SnoozeUtil.customIdPrefix, "modal", session.id))
                    .setTitle("Snooze Reminder");

                const durationInput = new TextInputBuilder()
                    .setCustomId("duration")
                    .setLabel("Snooze duration (e.g. 10m, 2h, 1d)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder().addComponents(durationInput);
                modal.addComponents(row);

                await interaction.showModal(modal);
                return true;
            case "5m":
                duration = (5 * Util.durationSeconds.minute) / Util.durationSeconds.milli;
                break;
            case "15m":
                duration = (15 * Util.durationSeconds.minute) / Util.durationSeconds.milli;
                break;
            case "1h":
                duration = Util.durationSeconds.hour / Util.durationSeconds.milli;
                break;
            case "modal":
                const durationStr = interaction.fields.getTextInputValue("duration");
                duration = DateUtil.parseInterval(durationStr);

                if (duration === null || duration <= 0) {
                    await interaction.reply({
                        content: `${getEmoji("warn")} Invalid duration: \`${durationStr}\`.`,
                        ephemeral: true
                    });

                    return true;
                }

                break;
            default:
                return false;
        }

        const snoozed = await getClient().reminderManager.snooze(interaction.user.id, reminder, duration);
        await session.destroy(true);

        const format = snoozed.format(false),
            content = `${getEmoji("info")} Reminder snoozed until ${format}.`;

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
