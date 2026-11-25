import { afterEach, beforeEach, describe, expect, test } from "vitest";

import NomiCodexClient from "../../../src/ai/sources/NomiCodexClient.js";

import Util from "../../../src/util/Util.js";
import HTTPUtil from "../../../src/util/vm/HTTPUtil.js";

import { cleanupRuntime, createCommandRuntime, getCommand } from "../../helpers/commandHarness.js";
import { createDiscordMessage, defaultReplyValue } from "../../helpers/discordStubs.js";
import createHttpStubServer from "../../helpers/httpStubServer.js";

const item = { id: "ingotSteel", name: "Steel Ingot" };
const use = { n: "<b>Steel Plate</b>", t: "Forge Hammer", e: 16, d: 56, x: "LV", i: "Steel Ingot (3)" };
const recipes = Array.from({ length: 12 }, (_, i) => ({
    idx: i + 15,
    type: "Blast Furnace",
    eu: 120,
    dur: 800,
    tier: "MV",
    heat: 1000,
    clean: true,
    ins: `Steel Dust (${i + 1})`,
    outs: "Steel Ingot (1)",
    variants: [{ type: "Alloy Blast Smelter" }]
}));
const card = "https://example.com/recipe.webp";

let runtime, server;

function getParams(path) {
    return server.state.requests
        .filter(req => req.pathname === path)
        .map(req => Object.fromEntries(new URLSearchParams(req.search)));
}

async function send(text) {
    const replies = [];

    const msg = createDiscordMessage(text, {
        reply: async data => {
            replies.push(data);
            return defaultReplyValue(data);
        }
    });

    await runtime.client.commandHandler.execute(msg);
    const out = Util.first(replies);
    expect(out).toBeDefined();
    expect(out.content ?? "", Util.first(out.files ?? [])?.attachment.toString()).not.toContain(
        "Encountered exception"
    );
    return out;
}

async function press(customId, userId = "user-1") {
    const interaction = {
        customId,
        user: { id: userId },
        replied: false,
        deferred: false,
        isMessageComponent: () => true,
        isModalSubmit: () => false,
        isRepliable: () => true,
        deferUpdate: async () => (interaction.deferred = true),
        deferReply: async options => {
            interaction.deferred = true;
            interaction.ephemeral = options.ephemeral;
        },
        editReply: async data => (interaction.output = data),
        update: async data => (interaction.output = data)
    };

    await runtime.client.interactionHandler.execute(interaction);
    return interaction;
}

beforeEach(async () => {
    server = await createHttpStubServer({
        "GET /search": ({ url }) => {
            const query = url.searchParams.get("q"),
                mode = url.searchParams.get("mode");

            switch (query) {
                case "pex":
                    return { json: { error: "not found", alternatives: [item] } };
                case "steel distillation tower":
                    return {
                        json: {
                            item: { ...item, types: ["Blast Furnace"] },
                            recipes: [],
                            machineFilter: "distillation tower",
                            mode
                        }
                    };
                case "miner 2":
                    return {
                        json: { item, recipes: [{ ...Util.first(recipes), ins: "Steel Dust\n".repeat(600) }], mode }
                    };
                case "steel ingot ebf":
                    return {
                        json: {
                            item,
                            recipes: [{ ...Util.first(recipes), itemId: "ingotHotSteel", itemName: "Hot Steel Ingot" }],
                            mode
                        }
                    };
                default:
                    return { json: { item, recipes, uses: [use], mode } };
            }
        },
        "GET /shot": ({ url }) => {
            return url.searchParams.get("r") === "16" ? { statusCode: 503 } : { json: { abs: card } };
        }
    });

    runtime = await createCommandRuntime({ loadHandlers: true });

    const http = HTTPUtil.createAxiosClient({ allowLocalhostRequests: true });
    getCommand(runtime, "rp").source = new NomiCodexClient(http, {
        searchUrls: [`${server.url}/search`],
        shotUrl: `${server.url}/shot`
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
    await server.close();
});

describe("rp command", () => {
    test("shows the tag-style help with built-in navigation", async () => {
        const out = await send("%rp");
        const embed = Util.first(out.embeds);

        expect(embed.color).toBe(0xa78bfa);
        expect(embed.description).toContain("**Search & view**\n`%rp <item>`");
        expect(embed.description).toContain("Use **Back** to return to the list.");
        expect(getParams("/search")).toEqual([]);
    });

    test("runs directly through the Discord command handler and opens a numbered use", async () => {
        const out = await send("%rp steel ingot --uses 1 --expert --light");

        expect(getParams("/search")).toEqual([{ q: "steel ingot", mode: "expert", uses: "1" }]);
        expect(getParams("/shot")).toEqual([
            {
                item: item.id,
                mode: "expert",
                r: "1",
                sel: "card",
                format: "json",
                wait: "8",
                view: "uses",
                type: "Forge Hammer",
                out: "Steel Plate",
                eu: "16",
                dur: "56",
                theme: "light"
            }
        ]);

        const embed = Util.first(out.embeds);
        expect(out.content).toBe("**Uses: Steel Ingot**");
        expect(embed.image.url).toBe(card);
        expect(embed.color).toBe(0xa78bfa);
        expect(embed.description).toBe(
            "**Steel Ingot** makes **Steel Plate** — Forge Hammer • 16 EU/t • 2.8s from **Steel Ingot (3)**\n_use 1 of 1 • expert mode_"
        );
        expect(embed.footer.text).toBe("NomiCodex • expert mode");
    });

    test("paginates and opens cards with the existing picker", async () => {
        const out = await send("%rp steel --page 2");

        const embed = Util.first(out.embeds);
        expect(out.content).toBe("**Steel Ingot**");
        expect(embed.color).toBe(0xa78bfa);
        expect(embed.description).toContain(
            "`11` Blast Furnace • 120 EU/t • 40s (MV) • 1,000K • cleanroom • also Alloy Blast Smelter\n  from **Steel Dust (11)** → **Steel Ingot (1)**"
        );
        expect(embed.description).toContain("page 2 of 2 (12 recipes)");

        const [row, nav] = out.components.map(component => component.toJSON().components);
        expect(row.map(button => button.label)).toEqual(["11", "12"]);
        expect(nav.map(button => button.label)).toContain("2 / 2");

        const other = await press(Util.first(row).custom_id, "other-user");
        expect(other.ephemeral).toBe(true);
        expect(Util.first(other.output.embeds).image.url).toBe(card);

        const shown = await press(Util.first(row).custom_id);
        expect(shown.deferred).toBe(true);
        expect(getParams("/shot").at(-1).r).toBe("26");
        expect(Util.first(shown.output.embeds).description).toContain("Steel Dust (11)");

        const back = Util.first(Util.first(shown.output.components).toJSON().components);
        const list = await press(back.custom_id);
        expect(Util.first(list.output.embeds).description).toBe(embed.description);
        expect(
            Util.first(list.output.components)
                .toJSON()
                .components.map(button => button.label)
        ).toEqual(["11", "12"]);
    });

    test("uses the linked hot ingot card and keeps the recipe text if the image fails", async () => {
        const out = await send("%rp steel ingot ebf");

        expect(getParams("/search").at(-1).q).toBe("steel ingot ebf");
        expect(getParams("/shot").at(-1)).toMatchObject({ item: "ingotHotSteel", r: "16" });
        expect(out.content).toBe("**Hot Steel Ingot**");

        const embed = Util.first(out.embeds);
        expect(embed.description).toContain("from **Steel Dust (1)** → **Steel Ingot (1)**");
        expect(embed.description).toContain("_recipe 1 of 1 • normal mode_");
        expect(embed.image).toBeUndefined();
    });

    test("reports missing items and machine matches without requesting a card", async () => {
        const missing = await send("%rp pex");
        expect(Util.first(missing.embeds).description).toContain("No item found for `pex`");
        expect(Util.first(missing.embeds).description).toContain("Did you mean: **Steel Ingot**");

        const machine = await send("%rp steel distillation tower");
        expect(Util.first(machine.embeds).description).toContain("has no **distillation tower** recipes.");
        expect(Util.first(machine.embeds).description).toContain("It has recipes in: Blast Furnace.");

        const outOfRange = await send("%rp steel 13");
        expect(Util.first(outOfRange.embeds).description).toContain("Recipe number must be 1–12.");
        expect(getParams("/shot")).toEqual([]);
    });

    test("keeps item tier numbers and attaches recipe details that exceed embed limits", async () => {
        const out = await send("%rp miner 2");

        expect(getParams("/search").at(-1).q).toBe("miner 2");
        expect(Util.first(out.files).attachment.toString()).toContain("from **Steel Dust");

        const list = await send("%rp miner 2 --list");
        expect(Util.first(Util.first(list.components).toJSON().components).label).toBe("1");
    });
});
