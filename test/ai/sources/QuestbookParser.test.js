import { describe, expect, test } from "vitest";

import QuestbookParser from "../../../src/ai/sources/QuestbookParser.js";

const betterQuesting = {
    "questDatabase:9": {
        "0:10": {
            "questID:3": 12,
            "preRequisites:11": [5],
            "properties:10": {
                "betterquesting:10": { "name:8": "§6Steel Age", "desc:8": "Make your first §lsteel§r ingot." }
            },
            "tasks:9": {
                "0:10": {
                    "taskID:8": "bq_standard:retrieval",
                    "requiredItems:9": {
                        "0:10": { "id:8": "gregtech:meta_ingot", "Count:3": 16, "Damage:2": 324 }
                    }
                },
                "1:10": { "taskID:8": "bq_standard:checkbox" }
            }
        },
        "1:10": {
            "questID:3": 5,
            "properties:10": { "betterquesting:10": { "name:8": "", "desc:8": "Get iron." } }
        }
    },
    "questLines:9": {
        "0:10": {
            "properties:10": { "betterquesting:10": { "name:8": "§aChapter 2" } },
            "quests:9": { "0:10": { "id:3": 12 } }
        }
    }
};

describe("QuestbookParser", () => {
    test("parses BetterQuesting exports", () => {
        const [steel, iron] = QuestbookParser.parse(betterQuesting);

        expect(steel).toEqual({
            id: "12",
            title: "Steel Age",
            chapter: "Chapter 2",
            keywords: "retrieval: 16x gregtech:meta_ingot:324 checkbox",
            text: "Make your first steel ingot.",
            tasks: ["retrieval: 16x gregtech:meta_ingot:324", "checkbox"],
            prereqs: ["5"]
        });

        expect(iron.title).toBe("Quest 5");
        expect(iron.chapter).toBeNull();
        expect(iron.prereqs).toEqual([]);
    });

    test("strips Minecraft formatting codes", () => {
        expect(QuestbookParser.stripFormatting("§6Gold§r and §lbold")).toBe("Gold and bold");
        expect(QuestbookParser.stripFormatting(null)).toBe("");
    });
});
