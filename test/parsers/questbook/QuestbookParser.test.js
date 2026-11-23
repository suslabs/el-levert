import { describe, expect, test } from "vitest";

import QuestbookParser from "../../../src/parsers/questbook/QuestbookParser.js";

import ParserError from "../../../src/errors/ParserError.js";

const item = (id, damage = 0, count = 1, oreDict = "") => ({
    "Count:3": count,
    "Damage:2": damage,
    "OreDict:8": oreDict,
    "id:8": id
});

const props = data => ({ "properties:10": { "betterquesting:10": data } });

// Excerpt of the Nomi-CEu DefaultQuests.json (BetterQuesting 4.2.2, format 2.0.0)
const nomiQuestbook = {
    "build:8": "4.2.2",
    "format:8": "2.0.0",
    "questDatabase:9": {
        "1:10": {
            "preRequisites:11": [255, 328, 386],
            "preRequisiteTypes:7": [0, 2, 0],
            ...props({
                "desc:8": "The Third Micro Miner. §2You'll need that Boron in the MV Field Generators.§r",
                "icon:10": item("nomilabs:tierthreeship"),
                "ismain:1": 1,
                "name:8": "§2Tier Three Micro Miner§r",
                "visibility:8": "ALWAYS"
            }),
            "questID:3": 65,
            "rewards:9": {
                "0:10": {
                    "index:3": 0,
                    "rewardID:8": "bq_standard:item",
                    "rewards:9": { "0:10": item("nomilabs:nomicoin5") }
                }
            },
            "tasks:9": {
                "0:10": {
                    "index:3": 0,
                    "requiredItems:9": {
                        "1:10": item("gregtech:machine", 170, 1, "questbookCanning"),
                        "0:10": item("nomilabs:tierthreeship")
                    },
                    "taskID:8": "bq_standard:retrieval"
                }
            }
        },
        "0:10": {
            "preRequisites:11": [27, 810],
            "preRequisiteTypes:7": [1, 0],
            ...props({
                "desc:8": "§9Sulfuric Acid§r is mainly produced in a 3-step process",
                "name:8": "§2Sulfuric Acid§r"
            }),
            "questID:3": 94,
            "rewards:9": {},
            "tasks:9": {
                "0:10": {
                    "index:3": 0,
                    "requiredFluids:9": { "0:10": { "Amount:3": 1, "FluidName:8": "sulfuric_acid" } },
                    "taskID:8": "bq_standard:fluid"
                }
            }
        },
        "2:10": {
            "preRequisites:11": [3],
            ...props({ "name:8": "Cake Based Dimensional Transit", "visibility:8": "UNLOCKED" }),
            "questID:3": 25,
            "rewards:9": {
                "0:10": {
                    "choices:9": {
                        "0:10": item("dimensionaledibles:overworld_cake"),
                        "1:10": { ...item("dimensionaledibles:custom_cake"), "tag:10": { "cakeName:8": "Void World" } }
                    },
                    "index:3": 0,
                    "rewardID:8": "bq_standard:choice"
                }
            },
            "tasks:9": { "0:10": { "index:3": 0, "taskID:8": "bq_standard:checkbox" } }
        }
    },
    "questLines:9": {
        "0:10": {
            "lineID:3": 2,
            "order:3": 6,
            ...props({ "desc:8": "§7MV§r tier", "name:8": "§6Mid Game" }),
            "quests:9": { "1:10": { "id:3": 94 }, "0:10": { "id:3": 65, "x:3": 10, "y:3": 20 } }
        }
    },
    "questSettings:10": { "betterquesting:10": { "pack_name:8": "Nomifactory" } }
};

describe("QuestbookParser", () => {
    test("parses BetterQuesting quests in index order with their tasks, rewards and prerequisites", () => {
        const book = QuestbookParser.parse(nomiQuestbook),
            [acid, miner, cake] = book.quests;

        expect(book.packName).toBe("Nomifactory");

        expect(miner).toEqual({
            id: "65",
            name: "Tier Three Micro Miner",
            desc: "The Third Micro Miner. You'll need that Boron in the MV Field Generators.",
            icon: { id: "nomilabs:tierthreeship", damage: 0, count: 1, oreDict: null },
            main: true,
            visibility: "ALWAYS",
            prereqs: [
                { id: "255", type: "normal" },
                { id: "328", type: "hidden" },
                { id: "386", type: "normal" }
            ],
            tasks: [
                {
                    type: "bq_standard:retrieval",
                    items: [
                        { id: "nomilabs:tierthreeship", damage: 0, count: 1, oreDict: null },
                        { id: "gregtech:machine", damage: 170, count: 1, oreDict: "questbookCanning" }
                    ],
                    fluids: []
                }
            ],
            rewards: [
                {
                    type: "bq_standard:item",
                    items: [{ id: "nomilabs:nomicoin5", damage: 0, count: 1, oreDict: null }],
                    choices: []
                }
            ]
        });

        expect(acid.prereqs).toEqual([
            { id: "27", type: "implicit" },
            { id: "810", type: "normal" }
        ]);
        expect(acid.tasks).toEqual([
            { type: "bq_standard:fluid", items: [], fluids: [{ name: "sulfuric_acid", amount: 1 }] }
        ]);
        expect(acid).toMatchObject({ icon: null, main: false, visibility: null, rewards: [] });

        expect(cake.rewards[0].choices.map(choice => choice.id)).toEqual([
            "dimensionaledibles:overworld_cake",
            "dimensionaledibles:custom_cake"
        ]);
        expect(cake.tasks).toEqual([{ type: "bq_standard:checkbox", items: [], fluids: [] }]);
        expect(cake.desc).toBe("");
    });

    test("parses quest lines in their stored order", () => {
        expect(QuestbookParser.parse(nomiQuestbook).lines).toEqual([
            { id: "2", name: "Mid Game", desc: "MV tier", order: 6, quests: ["65", "94"] }
        ]);
    });

    test("accepts plain JSON lists and rejects files without a quest database", () => {
        const book = QuestbookParser.parse({ questDatabase: [{ questID: 1, tasks: [] }] });

        expect(book).toMatchObject({ packName: null, lines: [] });
        expect(book.quests[0]).toMatchObject({ id: "1", name: "", prereqs: [], tasks: [], rewards: [] });

        expect(() => QuestbookParser.parse({ "questLines:9": {} })).toThrow(ParserError);
        expect(() => QuestbookParser.parse(null)).toThrow("Invalid questbook: no quest database found");
    });

    test("strips Minecraft formatting codes", () => {
        expect(QuestbookParser.stripFormatting("§6Gold§r and §lbold")).toBe("Gold and bold");
        expect(QuestbookParser.stripFormatting(null)).toBe("");
    });
});
