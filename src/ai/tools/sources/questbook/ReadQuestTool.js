import QuestTool from "./QuestTool.js";

import AIPhases from "../../../../structures/ai/AIPhases.js";

import Util from "../../../../util/Util.js";
import ArrayUtil from "../../../../util/ArrayUtil.js";
import ToolParams from "../../../../util/ai/ToolParams.js";

import AIError from "../../../../errors/AIError.js";

class ReadQuestTool extends QuestTool {
    static info = {
        name: "read_quest",
        emoji: "📖",
        phase: AIPhases.reading,
        description: "Read quests from search_quests in full, with their tasks and prerequisites.",
        parameters: ToolParams.object(
            {
                ids: ToolParams.stringArray("Quest IDs from search_quests."),
                book: ToolParams.string("Questbook name from the runtime context (default: the first one)."),
                expert: ToolParams.boolean("Use the expert (hard) mode questbook.")
            },
            ["ids"]
        )
    };

    static maxQuests = 5;
    static textLength = 2500;

    getStatus() {
        return "Reading quests";
    }

    execute(args, session) {
        const ids = ArrayUtil.guaranteeArray(args.ids, null, true).slice(0, ReadQuestTool.maxQuests).map(String);

        if (Util.empty(ids)) {
            throw new AIError("ids are required");
        }

        const questbook = this.getQuestbook(args.book),
            mode = questbook.getMode(session.resolveExpert(args.expert));

        return { quests: ids.map(id => this._formatQuest(questbook, id, mode)) };
    }

    _formatQuest(questbook, id, mode) {
        const quest = questbook.get(id, mode);

        if (quest === null) {
            return { id, error: "No quest with this ID." };
        }

        return {
            source: this.formatSource(quest),
            id,
            title: quest.title,
            chapter: quest.chapter,
            text: Util.trimString(quest.text, ReadQuestTool.textLength),
            tasks: quest.tasks,
            prereqs: quest.prereqs.map(prereq => ({
                id: prereq,
                title: questbook.get(prereq, mode)?.title ?? null
            }))
        };
    }
}

export default ReadQuestTool;
