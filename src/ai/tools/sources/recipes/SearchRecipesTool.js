import SourceTool from "../SourceTool.js";

import NomiCodexClient from "../../../sources/NomiCodexClient.js";

import { OverclockingValues } from "../../../../structures/OverclockingValues.js";

import AIPhases from "../../../../structures/ai/AIPhases.js";
import AISourceTypes from "../../../../structures/ai/AISourceTypes.js";

import Util from "../../../../util/Util.js";
import ArrayUtil from "../../../../util/ArrayUtil.js";
import AIUtil from "../../../../util/ai/AIUtil.js";
import HTMLUtil from "../../../../util/misc/HTMLUtil.js";
import ToolParams from "../../../../util/ai/ToolParams.js";

const wordRegex = /[^a-z0-9]+/;

function getInitials(name) {
    return name
        .toLowerCase()
        .split(wordRegex)
        .filter(Util.nonemptyString)
        .map(word => Util.first(word))
        .join("");
}

function getItem(data, query) {
    if (data.error === NomiCodexClient.notFoundError || data.item == null) {
        return null;
    }

    const { id, name } = data.item,
        item = { id, name: HTMLUtil.stripTags(name) };

    query = AIUtil.normalizeQuery(query);
    const matches = ` ${AIUtil.normalizeQuery(item.name)} `.includes(` ${query} `) || id?.toLowerCase() === query;

    return matches ? item : null;
}

function countMachines(entries, getType) {
    return Object.fromEntries(ArrayUtil.frequency(entries, entry => HTMLUtil.stripTags(getType(entry))));
}

function toSeconds(ticks) {
    return ticks / OverclockingValues.ticksPerSecond;
}

function formatRecipe(recipe, itemId) {
    const out = {
        itemId: recipe.itemId ?? itemId,
        idx: recipe.idx ?? null,
        role: recipe.role,
        machine: recipe.type,
        euPerTick: recipe.eu,
        seconds: toSeconds(recipe.dur),
        tier: recipe.tier,
        heat: recipe.heat,
        cleanroom: recipe.clean ?? false,
        inputs: HTMLUtil.stripTags(recipe.ins),
        outputs: HTMLUtil.stripTags(recipe.outs)
    };

    const variants = recipe.variants ?? [];

    if (!Util.empty(variants)) {
        out.variants = variants.length;
        out.alsoIn = ArrayUtil.unique(variants.map(variant => variant.type).filter(type => type !== recipe.type));
    }

    return out;
}

function formatUse(use) {
    return {
        makes: HTMLUtil.stripTags(use.n),
        machine: use.t,
        euPerTick: use.e,
        seconds: toSeconds(use.d),
        inputs: HTMLUtil.stripTags(use.i)
    };
}

class SearchRecipesTool extends SourceTool {
    static info = {
        name: "search_recipes",
        emoji: "🧪",
        phase: AIPhases.searching,
        description:
            "Look up an item's recipes (or, with uses, what it's used in) in the modpack's recipe viewer. Search for the item alone and put a machine type in machine. Recipes come ranked, main production route first, each with a role: hot (EBF step making the hot ingot), cool (Vacuum Freezer cooling it), make, byproduct, recycle or reshape.",
        parameters: ToolParams.object(
            {
                query: ToolParams.string(
                    'The item or material name only, e.g. "Liquid Ender Air". Never add machines or extra words.'
                ),
                machine: ToolParams.string(
                    'Only show recipes made in this machine type, e.g. "Distillation Tower", "EBF", "LCR".'
                ),
                uses: ToolParams.boolean("List recipes that use the item instead of ones that make it."),
                expert: ToolParams.boolean(
                    "Use expert (hard) mode recipes. Items only in expert mode switch to it on their own."
                )
            },
            ["query"]
        )
    };

    static sourceType = AISourceTypes.recipes;

    static maxCalls = 4;

    static maxResults = 15;

    static machineMissNote = "No recipes in that machine. Pick one from machines instead of searching again.";

    static machineAliases = Object.freeze({
        ebf: "blast furnace",
        pbf: "primitive blast furnace",
        abs: "alloy blast smelter",
        lcr: "chemical reactor",
        vf: "vacuum freezer",
        dt: "distillation tower"
    });

    getStatus(args) {
        return `Searching recipes for "${this.formatArg(args.query)}"`;
    }

    async execute(args, session) {
        const query = this.requireString(args, "query");

        let expert = session.resolveExpert(args.expert);

        const uses = args.uses ?? false,
            machine = Util.nonemptyString(args.machine) ? args.machine.trim() : null;

        let { data, item, fluid } = await this._resolveItem(query, uses, session, expert);

        if (item === null && typeof args.expert === "undefined" && !expert) {
            const match = await this._resolveItem(query, uses, session, true);

            if (match.item !== null) {
                ({ data, item, fluid } = match);
                expert = true;
                session.resolveExpert(true);
            }
        }

        const alternatives = (data.alternatives ?? []).map(alt => HTMLUtil.stripTags(alt.name));

        if (item === null) {
            const suggestions = [data.item?.name, ...alternatives];
            return { query, found: false, suggestions: suggestions.filter(Util.nonemptyString) };
        }

        if (!fluid && machine === null) {
            const choices = SearchRecipesTool._getMaterialForms(query, item, alternatives);

            if (!Util.empty(choices)) {
                return {
                    query,
                    found: false,
                    choices,
                    note: "The material has several forms. Ask which form the user wants."
                };
            }
        }

        const out = {
            mode: this.source.getMode(expert),
            item,
            machine,
            alternatives
        };

        const entries = (uses ? data.uses : data.recipes) ?? [],
            getType = uses ? use => use.t : recipe => recipe.type;

        const matches = SearchRecipesTool._filterByMachine(entries, getType, machine),
            shown = matches.slice(0, SearchRecipesTool.maxResults);

        out.machines = countMachines(entries, getType);

        if (uses) {
            out.uses = shown.map(use => formatUse(use));
            out.totalUses = matches.length;
        } else {
            out.recipes = shown.map(recipe => formatRecipe(recipe, item.id));
            out.totalRecipes = matches.length;
        }

        if (machine !== null && Util.empty(matches)) {
            out.note = SearchRecipesTool.machineMissNote;
        }

        return out;
    }

    static _fluidQualifier = /^(?:fluid|molten)\s+|\s+(?:fluid|\(fluid\))$/gi;
    static _materialForms = new Set(["dust", "ingot", "gem"]);

    static _getMaterialForms(query, item, alternatives) {
        query = AIUtil.normalizeQuery(query);

        if (!item.id?.startsWith("f:") || AIUtil.normalizeQuery(item.name) !== query) {
            return [];
        }

        const prefix = `${query} `;

        const forms = alternatives.filter(name => {
            const normalized = AIUtil.normalizeQuery(name);
            return normalized.startsWith(prefix) && this._materialForms.has(normalized.slice(prefix.length));
        });

        return Util.empty(forms) ? [] : ArrayUtil.unique([...forms, `${item.name} (fluid)`]);
    }

    static _matchesMachine(type, machine) {
        const lowerType = HTMLUtil.stripTags(type).toLowerCase();

        machine = machine.toLowerCase();
        machine = SearchRecipesTool.machineAliases[machine] ?? machine;

        return lowerType.includes(machine) || getInitials(lowerType) === machine;
    }

    static _filterByMachine(entries, getType, machine) {
        if (machine === null) {
            return entries;
        }

        return entries.filter(entry => SearchRecipesTool._matchesMachine(getType(entry), machine));
    }

    async _search(query, uses, session, expert) {
        return await this.source.search(query, {
            mode: this.source.getMode(expert),
            uses,
            timeout: session.toolTimeout()
        });
    }

    async _resolveItem(query, uses, session, expert) {
        const data = await this._search(query, uses, session, expert),
            item = getItem(data, query);

        const fluidQuery = query.replace(SearchRecipesTool._fluidQualifier, "").trim(),
            fluid = fluidQuery !== query;

        if (item === null && fluid && Util.nonemptyString(fluidQuery)) {
            const fluidData = await this._search(fluidQuery, uses, session, expert),
                fluidItem = getItem(fluidData, fluidQuery);

            if (fluidItem?.id?.startsWith("f:")) {
                return { data: fluidData, item: fluidItem, fluid };
            }
        }

        return { data, item, fluid };
    }
}

export default SearchRecipesTool;
