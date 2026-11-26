import { EmbedBuilder, bold, escapeMarkdown, inlineCode } from "discord.js";

import { getConfig, getEmoji } from "../../LevertClient.js";

import Util from "../Util.js";
import ListDetailView from "./ListDetailView.js";
import PaginationUtil from "./PaginationUtil.js";
import QuestbookUtil from "./QuestbookUtil.js";

function formatLine(quest) {
    return `- **${quest.id}**: ${escapeMarkdown(quest.title)} (${quest.chapter})`;
}

class QuestSearchUtil {
    static maxResults = 50;
    static commandName = "qb";

    static async reply(ctx, book, mode, query) {
        const quests = book.searchTitles(query, mode, QuestSearchUtil.maxResults);

        if (Util.empty(quests)) {
            return `${getEmoji("info")} Found **no** quests matching ${bold(escapeMarkdown(query))}.`;
        } else if (Util.single(quests)) {
            return QuestbookUtil.formatQuest(book, mode, Util.first(quests));
        }

        const usage = inlineCode(`${getConfig().cmdPrefix}${QuestSearchUtil.commandName} ${book.name} <id>`);

        const header = `${getEmoji("info")} Found **${Util.formatNumber(quests.length)}** quests.`;

        const footer = QuestbookUtil.formatBook(book, mode);

        return await PaginationUtil.paginate(ctx, {
            items: quests,
            maxLimit: ListDetailView.maxLimit,

            controls: ListDetailView.createPicker(quest => QuestbookUtil.formatQuest(book, mode, quest), {
                getLabel: quest => quest.id
            }),

            render: items => ({
                content: `${header} Click one or use ${usage}:`,
                embeds: [
                    new EmbedBuilder().setDescription(items.map(formatLine).join("\n")).setFooter({ text: footer })
                ]
            }),

            dumpHeader: header,
            formatDump: () => quests.map(formatLine).join("\n"),
            filename: "quests.txt"
        });
    }
}

export default QuestSearchUtil;
