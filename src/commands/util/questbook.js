import { getClient, getConfig, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import PaginationUtil from "../../util/commands/PaginationUtil.js";
import PickerUtil from "../../util/commands/PickerUtil.js";
import QuestbookUtil from "../../util/commands/QuestbookUtil.js";
import QuestSearchUtil from "../../util/commands/QuestSearchUtil.js";

class QuestbookCommand {
    static info = {
        name: "questbook",
        aliases: ["qb"],
        category: "util",
        args: "<questbook> <quest or id> [--expert] [--page <num>] [--all]",
        description:
            "Shows a quest from a modpack questbook by name or id. When several quests match, lists them with buttons to open each one.",
        usage: "- <questbook>: Which questbook to search (e.g. nfu).\n- <quest or id>: A quest name (fuzzy matched) or a quest id from the list.\n- --expert, -e: Search the expert mode questbook.",
        arguments: [
            ...PaginationUtil.getPaginationArguments({ defaultLimit: QuestSearchUtil.pageSize }),
            {
                name: "expert",
                kind: "option",
                type: "boolean",
                shorthand: "e"
            },
            {
                name: "book",
                kind: "positional",
                index: 0,
                lowercase: true
            },
            {
                name: "query",
                kind: "rest"
            }
        ]
    };

    load() {
        if (Util.empty(Object.keys(getConfig().questbooks))) {
            return false;
        }
    }

    async handler(ctx) {
        const manager = getClient().questbookManager;

        const name = ctx.arg("book"),
            query = (ctx.arg("query") ?? "").trim();

        if (Util.empty(name) || Util.empty(query)) {
            return `${getEmoji("info")} ${this.getArgsHelp()}\nQuestbooks: ${QuestbookUtil.formatNames(manager)}`;
        }

        try {
            const book = manager.get(name),
                mode = book.getMode(ctx.arg("expert") ?? false);

            const quest = QuestbookUtil.findQuest(book, mode, query);

            if (quest !== null) {
                return QuestbookUtil.formatQuest(book, mode, quest);
            }

            return await QuestSearchUtil.reply(ctx, book, mode, query);
        } catch (err) {
            if (err.name !== "QuestbookError") {
                throw err;
            }

            return `${getEmoji("warn")} ${err.message}. Questbooks: ${QuestbookUtil.formatNames(manager)}`;
        }
    }

    async interactionHandler(ctx) {
        return await PickerUtil.handleInteraction(ctx);
    }
}

export default QuestbookCommand;
