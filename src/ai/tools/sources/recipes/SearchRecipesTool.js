import SourceTool from "../SourceTool.js";

import NomiCodexClient from "../../../sources/NomiCodexClient.js";

import { OverclockingValues } from "../../../../structures/OverclockingValues.js";

import AIPhases from "../../../../structures/ai/AIPhases.js";
import AISourceTypes from "../../../../structures/ai/AISourceTypes.js";

import Util from "../../../../util/Util.js";
import ArrayUtil from "../../../../util/ArrayUtil.js";
import HTMLUtil from "../../../../util/misc/HTMLUtil.js";
import ToolParams from "../../../../util/ai/ToolParams.js";

class SearchRecipesTool extends SourceTool {
    static info = {
        name: "search_recipes",
        emoji: "🧪",
        phase: AIPhases.searching,
        description:
            "Look up an item's recipes (or, with uses, what it's used in) in the modpack's recipe viewer. Search for the item alone and put a machine type in machine. Results list the machine types the item has recipes in, with the main production recipe usually first.",
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
    static hotIngotNote =
        "This ingot comes out of the Blast Furnace hot. hotIngot lists how the hot ingot is made; it is then cooled into the ingot in a Vacuum Freezer.";

    static machineAliases = Object.freeze({
        ebf: "blast furnace",
        pbf: "primitive blast furnace",
        abs: "alloy blast smelter",
        lcr: "chemical reactor",
        vf: "vacuum freezer",
        dt: "distillation tower"
    });

    static _hotIngotRegex = /\bHot [^,(]+ Ingot\b/;

    static _spaceRegex = /\s+/g;
    static _formWordsRegex =
        /\b(?:tiny pile of|small pile of|block of|hot|dust|ingot|nugget|plate|rod|bolt|screw|ring|gear|foil|wire|gem|bar|sheet|pulp)\b/g;

    getStatus(args) {
        return `Searching recipes for "${this.formatArg(args.query)}"`;
    }

    async execute(args, session) {
        const query = this.requireString(args, "query");

        const expert = session.resolveExpert(args.expert);

        const uses = args.uses ?? false,
            machine = Util.nonemptyString(args.machine) ? args.machine.trim() : null;

        let data = await this._search(query, uses, session, expert);

        if (data.error === NomiCodexClient.notFoundError && typeof args.expert === "undefined" && !expert) {
            const expertData = await this._search(query, uses, session, true);

            if (expertData.error !== NomiCodexClient.notFoundError) {
                session.resolveExpert(true);
                data = expertData;
            }
        }

        if (data.error === NomiCodexClient.notFoundError) {
            return { query, found: false, suggestions: (data.alternatives ?? []).map(alt => alt.name) };
        }

        const item = data.item;

        const out = {
            mode: this.source.getMode(session.expert),
            item: { id: item.id, name: HTMLUtil.stripTags(item.name) },
            machine,
            alternatives: data.alternatives.map(alt => HTMLUtil.stripTags(alt.name))
        };

        const entries = uses ? data.uses : data.recipes,
            getType = uses ? use => use.t : recipe => recipe.type;

        const matches = SearchRecipesTool._filterByMachine(entries, getType, machine),
            shown = matches.slice(0, SearchRecipesTool.maxResults);

        out.machines = SearchRecipesTool._countMachines(entries, getType);

        if (uses) {
            out.uses = shown.map(use => this._formatUse(use));
            out.totalUses = matches.length;
        } else {
            const material = SearchRecipesTool._getMaterial(item.name);

            out.recipes = shown.map(recipe => this._formatRecipe(recipe, material));
            out.totalRecipes = matches.length;
        }

        const hotIngot = uses ? null : await this._findHotIngot(data.recipes, machine, session);

        if (hotIngot !== null) {
            out.hotIngot = hotIngot;
            out.note = SearchRecipesTool.hotIngotNote;
        } else if (machine !== null && Util.empty(matches)) {
            out.note = SearchRecipesTool.machineMissNote;
        }

        return out;
    }

    static _wordRegex = /[^a-z0-9]+/;

    static _getInitials(name) {
        return name
            .toLowerCase()
            .split(SearchRecipesTool._wordRegex)
            .filter(Util.nonemptyString)
            .map(word => Util.first(word))
            .join("");
    }

    static _matchesMachine(type, machine) {
        const lowerType = HTMLUtil.stripTags(type).toLowerCase();

        machine = machine.toLowerCase();
        machine = SearchRecipesTool.machineAliases[machine] ?? machine;

        return lowerType.includes(machine) || SearchRecipesTool._getInitials(lowerType) === machine;
    }

    static _filterByMachine(entries, getType, machine) {
        if (machine === null) {
            return entries;
        }

        return entries.filter(entry => SearchRecipesTool._matchesMachine(getType(entry), machine));
    }

    static _countMachines(entries, getType) {
        return Object.fromEntries(ArrayUtil.frequency(entries, entry => HTMLUtil.stripTags(getType(entry))));
    }

    static _getHotIngotName(recipes) {
        for (const recipe of recipes) {
            const match = HTMLUtil.stripTags(recipe.ins).match(SearchRecipesTool._hotIngotRegex);

            if (match !== null) {
                return Util.first(match);
            }
        }

        return null;
    }

    static _getMaterial(name) {
        return HTMLUtil.stripTags(name)
            .toLowerCase()
            .replace(SearchRecipesTool._formWordsRegex, "")
            .replace(SearchRecipesTool._spaceRegex, " ")
            .trim();
    }

    static _toSeconds(ticks) {
        return ticks / OverclockingValues.ticksPerSecond;
    }

    async _search(query, uses, session, expert) {
        return await this.source.search(query, {
            mode: this.source.getMode(expert),
            uses,
            timeout: session.toolTimeout()
        });
    }

    async _findHotIngot(recipes, machine, session) {
        const name = SearchRecipesTool._getHotIngotName(recipes);

        if (name === null) {
            return null;
        }

        const data = await this._search(name, false, session, session.expert);

        if (data.error === NomiCodexClient.notFoundError) {
            return null;
        }

        const matches = SearchRecipesTool._filterByMachine(data.recipes, recipe => recipe.type, machine);

        return {
            item: { id: data.item.id, name: HTMLUtil.stripTags(data.item.name) },
            recipes: matches.slice(0, SearchRecipesTool.maxResults).map(recipe => this._formatRecipe(recipe, "")),
            totalRecipes: matches.length
        };
    }

    _formatRecipe(recipe, material) {
        const inputs = HTMLUtil.stripTags(recipe.ins);

        return {
            idx: recipe.idx ?? null,
            machine: recipe.type,
            euPerTick: recipe.eu,
            seconds: SearchRecipesTool._toSeconds(recipe.dur),
            tier: recipe.tier,
            heat: recipe.heat,
            cleanroom: recipe.clean ?? false,
            inputs,
            outputs: HTMLUtil.stripTags(recipe.outs),
            fromSameMaterial: !Util.empty(material) && inputs.toLowerCase().includes(material)
        };
    }

    _formatUse(use) {
        return {
            makes: HTMLUtil.stripTags(use.n),
            machine: use.t,
            euPerTick: use.e,
            seconds: SearchRecipesTool._toSeconds(use.d),
            inputs: HTMLUtil.stripTags(use.i)
        };
    }
}

export default SearchRecipesTool;
