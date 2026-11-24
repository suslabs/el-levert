import { EmbedBuilder, escapeMarkdown, inlineCode } from "discord.js";

import PackModes from "../../structures/PackModes.js";

import Util from "../Util.js";
import DiscordUtil from "../DiscordUtil.js";

const QuestbookUtil = Object.freeze({
    defaultLogic: "AND",

    formatNames: manager => {
        return manager.names.map(name => `${inlineCode(name)} (${manager.get(name).title})`).join(", ");
    },

    findQuest: (book, mode, query) => {
        return book.get(query, mode) ?? book.findByTitle(query, mode);
    },

    formatBook: (book, mode) => {
        const parts = [mode === PackModes.expert ? `${book.title} questbook (expert)` : `${book.title} questbook`],
            version = book.getVersion(mode);

        if (version !== null) {
            parts.push(`v${version}`);
        }

        return parts.join(" · ");
    },

    _blankLinesRegex: /\n{3,}/g,
    _formatBody: quest => {
        if (Util.empty(quest.markdown)) {
            return "No description.";
        }

        return quest.markdown.replace(QuestbookUtil._blankLinesRegex, "\n\n");
    },

    _formatPrereqs: (book, mode, quest) => {
        return quest.prereqs
            .map(id => book.get(id, mode))
            .filter(prereq => prereq !== null)
            .map(prereq => `- **${prereq.id}**: ${escapeMarkdown(prereq.title)}`);
    },

    _createEmbed: (title, body, footer, requires) => {
        const embed = new EmbedBuilder()
            .setAuthor({ name: Util.trimString(title, DiscordUtil.embedLimits.author) })
            .setDescription(body)
            .setFooter({ text: footer });

        if (!Util.empty(requires.lines)) {
            embed.addFields({
                name: requires.name,
                value: Util.trimString(requires.lines.join("\n"), DiscordUtil.embedLimits.fieldValue)
            });
        }

        return embed;
    },

    _createFile: (title, body, footer, requires) => {
        const sections = [`# ${title}`, body];

        if (!Util.empty(requires.lines)) {
            sections.push(`## ${requires.name}\n${requires.lines.join("\n")}`);
        }

        return {
            content: `**${escapeMarkdown(title)}**\n${footer}`,
            ...DiscordUtil.getFileAttach(`${sections.join("\n\n")}\n`, "quest.md")
        };
    },

    formatQuest: (book, mode, quest) => {
        const title = `${quest.title} (${quest.chapter})`,
            body = QuestbookUtil._formatBody(quest);

        const footer = QuestbookUtil.formatBook(book, mode),
            requires = {
                name: `Requires (${quest.logic ?? QuestbookUtil.defaultLogic})`,
                lines: QuestbookUtil._formatPrereqs(book, mode, quest)
            };

        if (body.length > DiscordUtil.embedLimits.description) {
            return QuestbookUtil._createFile(title, body, footer, requires);
        }

        return { embeds: [QuestbookUtil._createEmbed(title, body, footer, requires)] };
    }
});

export default QuestbookUtil;
