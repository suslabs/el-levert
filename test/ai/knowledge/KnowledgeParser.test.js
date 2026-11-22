import { describe, expect, test } from "vitest";

import KnowledgeParser from "../../../src/ai/knowledge/KnowledgeParser.js";

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

describe("KnowledgeParser", () => {
    test("parses BetterQuesting exports", () => {
        const [steel, iron] = KnowledgeParser.parse("betterquesting", betterQuesting, "questbook");

        expect(steel).toEqual({
            kind: "questbook",
            id: "12",
            title: "Steel Age",
            chapter: "Chapter 2",
            keywords: "retrieval: 16x gregtech:meta_ingot:324 checkbox",
            text: "Make your first steel ingot.",
            tasks: ["retrieval: 16x gregtech:meta_ingot:324", "checkbox"],
            prereqs: ["5"],
            ref: null
        });

        expect(iron.title).toBe("Quest 5");
        expect(iron.chapter).toBeNull();
        expect(iron.prereqs).toEqual([]);
    });

    test("parses JSON entry lists", () => {
        const entries = KnowledgeParser.parse(
            "json",
            {
                entries: [
                    { id: "ebf", title: "EBF", text: "Blast furnace.", keywords: ["blast"], url: "https://x.test" }
                ]
            },
            "domain"
        );

        expect(entries).toEqual([
            {
                kind: "domain",
                id: "ebf",
                title: "EBF",
                chapter: null,
                keywords: "blast",
                text: "Blast furnace.",
                tasks: [],
                prereqs: [],
                ref: "https://x.test"
            }
        ]);

        expect(KnowledgeParser.parse("json", [{ title: "No id" }], "glossary")[0].id).toBe("0");
    });

    test("rejects unknown formats", () => {
        expect(() => KnowledgeParser.parse("xml", {}, "domain")).toThrow("Unknown knowledge format");
    });
});
