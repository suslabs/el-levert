import { EmbedBuilder, bold, escapeMarkdown, inlineCode } from "discord.js";

import { getConfig, getEmoji } from "../../LevertClient.js";

import Util from "../Util.js";
import PickerUtil from "./PickerUtil.js";
import QuestbookUtil from "./QuestbookUtil.js";

const QuestSearchUtil = Object.freeze({
    maxResults: 50,
    pageSize: 10,
    commandName: "qb",

    _formatLine: quest => {
        return `- **${quest.id}**: ${escapeMarkdown(quest.title)} (${quest.chapter})`;
    },

    reply: async (ctx, book, mode, query) => {
        const quests = book.searchTitles(query, mode, QuestSearchUtil.maxResults);

        if (Util.empty(quests)) {
            return `${getEmoji("info")} Found **no** quests matching ${bold(escapeMarkdown(query))}.`;
        } else if (Util.single(quests)) {
            return QuestbookUtil.formatQuest(book, mode, Util.first(quests));
        }

        const usage = inlineCode(`${getConfig().cmdPrefix}${QuestSearchUtil.commandName} ${book.name} <id>`),
            header = `${getEmoji("info")} Found **${Util.formatNumber(quests.length)}** quests. Click one or use ${usage}:`;

        const footer = QuestbookUtil.formatBook(book, mode);

        return await PickerUtil.pick(ctx, {
            items: quests,
            pageSize: QuestSearchUtil.pageSize,

            getLabel: quest => quest.id,
            renderItem: quest => QuestbookUtil.formatQuest(book, mode, quest),
            renderList: items => ({
                content: header,
                embeds: [
                    new EmbedBuilder()
                        .setDescription(items.map(QuestSearchUtil._formatLine).join("\n"))
                        .setFooter({ text: footer })
                ]
            }),

            dumpHeader: header,
            formatDump: () => quests.map(QuestSearchUtil._formatLine).join("\n"),
            filename: "quests.txt"
        });
    }
});

export default QuestSearchUtil;
