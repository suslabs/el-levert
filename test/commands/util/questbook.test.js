import { afterEach, describe, expect, test } from "vitest";

import { ButtonStyle } from "discord.js";

import createHttpStubServer from "../../helpers/httpStubServer.js";
import { createDiscordMessage } from "../../helpers/discordStubs.js";
import { cleanupRuntime, createCommandRuntime, executeCommand, getCommand } from "../../helpers/commandHarness.js";

import Util from "../../../src/util/Util.js";

let runtime, server;

afterEach(async () => {
    await cleanupRuntime(runtime);
    await server?.close();

    runtime = null;
    server = null;
});

const item = (id, damage = 0, count = 1) => ({ "Count:3": count, "Damage:2": damage, "OreDict:8": "", "id:8": id });

const quest = (id, name, desc, prereqs, tasks) => ({
    "questID:3": id,
    "preRequisites:11": prereqs,
    "properties:10": { "betterquesting:10": { "name:8": name, "desc:8": desc } },
    "tasks:9": tasks
});

const questbook = {
    "questDatabase:9": {
        "0:10": quest(0, "Iron Age", "Get some iron.", [], {}),
        "1:10": quest(1, "§6Steel Age", "Make §asteel§r in the EBF.", [0], {
            "0:10": {
                "taskID:8": "bq_standard:retrieval",
                "requiredItems:9": { "0:10": item("gregtech:meta_ingot", 324, 16) }
            }
        }),
        "2:10": quest(2, "Stainless Steel", "Upgrade your steel.", [1], {}),
        "4:10": quest(4, "Huge Quest", "§6Long§r text. ".repeat(500), [], {}),
        "3:10": quest(3, "Gap", "Unused gap quest.", [], {})
    },
    "questLines:9": {
        "0:10": {
            "lineID:3": 0,
            "properties:10": { "betterquesting:10": { "name:8": "The Beginning" } },
            "quests:9": { "0:10": { "id:3": 0 }, "1:10": { "id:3": 1 }, "2:10": { "id:3": 2 }, "3:10": { "id:3": 4 } }
        }
    },
    "questSettings:10": { "betterquesting:10": { "pack_name:8": "Test Pack", "pack_version:3": 13 } }
};

async function setup() {
    server = await createHttpStubServer({ "GET /normal.json": () => ({ json: questbook }) });

    runtime = await createCommandRuntime({
        loadVMs: false,
        loadHandlers: true,
        config: { questbooks: { NFU: { title: "Test Pack", urls: { normal: `${server.url}/normal.json` } } } }
    });

    return getCommand(runtime, "questbook");
}

describe("questbook command", () => {
    test("lists the questbooks when arguments are missing", async () => {
        const command = await setup();

        await expect(executeCommand(command, "")).resolves.toContain("`nfu` (Test Pack)");
        await expect(executeCommand(command, "nfu")).resolves.toContain("`nfu` (Test Pack)");
    });

    test("shows a quest by exact name or id with requirements in a field", async () => {
        const command = await setup();

        const out = await executeCommand(command, "NFU steel age");
        expect(out.content).toBeUndefined();

        expect(out.embeds[0].toJSON()).toEqual({
            author: { name: "Steel Age (The Beginning)" },
            description: "Make **steel** in the EBF.",
            fields: [{ name: "Requires (AND)", value: "- **0**: Iron Age" }],
            footer: { text: "Test Pack questbook · v13" }
        });

        const byId = await executeCommand(command, "nfu 1");
        expect(byId.embeds[0].toJSON().author.name).toBe("Steel Age (The Beginning)");
    });

    test("lists matches with bullets and buttons that open each quest", async () => {
        const command = await setup();

        const out = await executeCommand(command, "nfu steel", { handler: runtime.client.commandHandler });

        expect(out.content).toBe(":information_source: Found **2** quests. Click one or use `%qb nfu <id>`:");

        const lines = out.embeds[0].toJSON().description.split("\n");
        expect([...lines].sort()).toEqual([
            "- **1**: Steel Age (The Beginning)",
            "- **2**: Stainless Steel (The Beginning)"
        ]);
        expect(out.embeds[0].toJSON().footer.text).toBe("Test Pack questbook · v13");

        const buttons = out.components.flatMap(row => row.toJSON().components);
        expect(buttons.map(button => button.label).sort()).toEqual(["1", "2"]);

        const click = (customId, userId) => {
            const interaction = {
                customId,
                user: { id: userId },
                replied: false,
                deferred: false,
                isMessageComponent: () => true,
                isModalSubmit: () => false,
                isRepliable: () => true,
                payloads: [],
                reply: async data => (interaction.payloads.push(data), { id: "click-reply" }),
                update: async data => (interaction.payloads.push(data), { id: "reply-1" })
            };

            return interaction;
        };

        const labelOf = button => button.label,
            idOf = label => buttons.find(button => button.label === label).custom_id;

        const other = click(idOf("2"), "someone-else");
        await runtime.client.interactionHandler.execute(other);

        expect(other.payloads[0].ephemeral).toBe(true);
        expect(JSON.stringify(other.payloads[0].embeds)).toContain("Stainless Steel (The Beginning)");

        const asker = click(idOf("2"), "user-1");
        await runtime.client.interactionHandler.execute(asker);

        const [shown] = asker.payloads,
            [backRow] = shown.components.map(row => row.toJSON().components);

        expect(JSON.stringify(shown.embeds)).toContain("Stainless Steel (The Beginning)");
        expect(shown.content).toBe("");
        expect(backRow.map(labelOf)).toEqual(["Back"]);
        expect(Util.first(backRow).style).toBe(ButtonStyle.Primary);

        const back = click(Util.first(backRow).custom_id, "user-1");
        await runtime.client.interactionHandler.execute(back);

        const [list] = back.payloads;
        expect(list.content).toBe(out.content);
        expect(
            list.components
                .flatMap(row => row.toJSON().components)
                .map(labelOf)
                .sort()
        ).toEqual(["1", "2"]);

        await expect(executeCommand(command, "nfu gap")).resolves.toContain("Found **no** quests matching **gap**.");
    });

    test("paginates more than one page of matches and keeps the quest buttons", async () => {
        const quests = Object.fromEntries(
            Array.from({ length: 12 }, (_, i) => [`${i}:10`, quest(i, `Furnace ${i}`, "Hot.", [], {})])
        );

        const lines = {
            "0:10": {
                "lineID:3": 0,
                "properties:10": { "betterquesting:10": { "name:8": "Genesis" } },
                "quests:9": Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`${i}:10`, { "id:3": i }]))
            }
        };

        server = await createHttpStubServer({
            "GET /big.json": () => ({ json: { "questDatabase:9": quests, "questLines:9": lines } })
        });

        runtime = await createCommandRuntime({
            loadVMs: false,
            loadHandlers: true,
            config: { questbooks: { big: { title: "Big Pack", urls: { normal: `${server.url}/big.json` } } } }
        });

        const replies = [];

        const msg = {
            ...createDiscordMessage("%qb big furnace"),
            reply: async data => (replies.push(data), { id: "reply-1", edit: async () => {} })
        };

        await executeCommand(getCommand(runtime, "questbook"), "big furnace", {
            msg,
            handler: runtime.client.commandHandler
        });

        const [out] = replies,
            rows = out.components.map(row => row.toJSON().components.map(button => button.label ?? button.emoji?.name));

        expect(out.content).toContain("Found **12** quests.");
        expect(rows).toHaveLength(3);
        expect(rows[0]).toHaveLength(5);
        expect(rows[1]).toHaveLength(5);
        expect(rows[2]).toContain("1 / 2");

        const press = async customId => {
            const interaction = {
                customId,
                user: { id: msg.author.id },
                replied: false,
                deferred: false,
                isMessageComponent: () => true,
                isModalSubmit: () => false,
                isRepliable: () => true,
                payloads: [],
                update: async data => (interaction.payloads.push(data), { id: "reply-1" })
            };

            await runtime.client.interactionHandler.execute(interaction);
            return Util.first(interaction.payloads);
        };

        const firstButton = Util.first(out.components.map(row => row.toJSON().components).flat());

        const shown = await press(firstButton.custom_id),
            backButton = Util.first(Util.first(shown.components).toJSON().components);

        const list = await press(backButton.custom_id),
            listRows = list.components.map(row =>
                row.toJSON().components.map(button => button.label ?? button.emoji?.name)
            );

        expect(listRows).toHaveLength(3);
        expect(listRows[2]).toContain("1 / 2");
    });

    test("sends quests too long for an embed as a file with the title outside", async () => {
        const command = await setup();

        const out = await executeCommand(command, "nfu huge quest");

        expect(out.content).toBe("**Huge Quest (The Beginning)**\nTest Pack questbook · v13");
        expect(out.embeds).toBeUndefined();
        expect(out.files.map(file => file.name)).toEqual(["quest.md"]);
        expect(out.files[0].attachment.toString()).toMatch(/^# Huge Quest \(The Beginning\)\n\n\*\*Long\*\* text\./);
    });

    test("reports unknown questbooks and missing modes", async () => {
        const command = await setup();

        await expect(executeCommand(command, "gtnh steel")).resolves.toContain('Unknown questbook "gtnh"');
        await expect(executeCommand(command, "nfu steel --expert")).resolves.toContain(
            "The Test Pack questbook has no expert mode"
        );
    });

    test("isn't loaded when no questbooks are configured", async () => {
        runtime = await createCommandRuntime({ loadVMs: false });
        expect(() => getCommand(runtime, "questbook")).toThrow();
    });
});
