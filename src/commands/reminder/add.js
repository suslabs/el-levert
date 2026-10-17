import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import DateUtil from "../../util/commands/DateUtil.js";

const messageRegex = /(.+?)\s*(?:(?:(['"`])((?:[^\2\\]|\\.)*?)\2)|$)/;

class ReminderAddCommand {
    static info = {
        name: "add",
        aliases: ["set", "create"],
        parent: "reminder",
        subcommand: true,
        args: '<date> ["message"] [--every <interval>]',
        description:
            "Create a scheduled or recurring reminder. The date can be a relative duration (e.g. 10m, 2h, 3d), a timestamp, or a recurring interval (e.g. every 10d 12:46, 12:46 every 1d, daily at 12:46). An initial date/time can also be combined with the --every option to schedule recurring notifications. When run as a reply with no message text, extracts the replied message content.",
        usage: '- <date>: When to trigger the reminder (e.g. 1h, 30m, 12:46, tomorrow at 18:00, every 10d 12:46, 12:46 every 1d).\n- ["message"]: Optional message text enclosed in quotes (or reply to a message).\n- --every, --interval, -e <interval>: Recurrence interval for repeated reminders (e.g. 1d, 2h, 10d).',
        parser: {
            requireArgs: true
        },
        arguments: [
            {
                name: "every",
                kind: "option",
                aliases: ["interval", "repeat", "recurring"],
                shorthand: "e"
            },
            {
                name: "date",
                reader: {
                    kind: "match",
                    pattern: messageRegex,
                    index: 1
                }
            },
            {
                name: "quote",
                reader: {
                    kind: "match",
                    pattern: messageRegex,
                    index: 2
                }
            },
            {
                name: "message",
                reader: {
                    kind: "match",
                    pattern: messageRegex,
                    index: 3
                }
            }
        ]
    };

    async handler(ctx) {
        const date = ctx.arg("date"),
            every = ctx.arg("every");

        if (Util.empty(date)) {
            return `${getEmoji("info")} ${this.getArgsHelp()}`;
        }

        if (Util.nonemptyString(every) && DateUtil.parseInterval(every) === null) {
            return `${getEmoji("warn")} Invalid recurring interval: \`${every}\`.`;
        }

        const parsed = DateUtil.parseDateRecurring(date, every);

        if (parsed === null) {
            return `${getEmoji("warn")} Invalid date: \`${date}\`.`;
        }

        let message = ctx.arg("message"),
            quote = ctx.arg("quote");

        if (typeof message === "string" && typeof quote === "string") {
            message = message.replaceAll("\\" + quote, quote);
        }

        if (Util.empty(message) && ctx.replyMsg !== null) {
            const replyContent = ctx.replyMsg.content ?? "",
                jumpUrl =
                    ctx.replyMsg.url ??
                    DiscordUtil.getMessageUrl(ctx.replyMsg.guildId ?? "@me", ctx.replyMsg.channelId, ctx.replyMsg.id);

            if (Util.nonemptyString(replyContent)) {
                const maxContentLen = getClient().reminderManager.maxMsgLength - jumpUrl.length - 1,
                    trimmed = Util.trimString(replyContent, maxContentLen, 1, { tight: true });

                message = Util.empty(trimmed) ? jumpUrl : `${trimmed} ${jumpUrl}`;
            } else {
                message = jumpUrl;
            }
        }

        {
            let err;
            [message, err] = getClient().reminderManager.checkMessage(message, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        let reminder;

        try {
            reminder = await getClient().reminderManager.add(
                ctx.msg.author.id,
                parsed.date,
                message,
                false,
                parsed.interval
            );
        } catch (err) {
            if (err.name !== "ReminderError") {
                throw err;
            }

            switch (err.message) {
                case "Invalid end time":
                    return `${getEmoji("warn")} Can't add a reminder for a time in the past.`;
                case "Invalid reminder interval":
                    return `${getEmoji("warn")} Invalid recurring interval.`;
                default:
                    return `${getEmoji("warn")} ${err.message}.`;
            }
        }

        const format = reminder.format();
        return `${getEmoji("info")} You will be reminded on ${format}${format.endsWith('"') ? "" : "."}`;
    }
}

export default ReminderAddCommand;
