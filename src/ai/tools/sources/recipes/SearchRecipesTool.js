import RecipeTool from "./RecipeTool.js";

import NomiCodexClient from "../../../sources/NomiCodexClient.js";

import { OverclockingValues } from "../../../../structures/OverclockingValues.js";

import AIPhases from "../../../../structures/ai/AIPhases.js";

import Util from "../../../../util/Util.js";
import HTMLUtil from "../../../../util/misc/HTMLUtil.js";
import ToolParams from "../../../../util/ai/ToolParams.js";

class SearchRecipesTool extends RecipeTool {
    static info = {
        name: "search_recipes",
        emoji: "🧪",
        phase: AIPhases.searching,
        description:
            'Look up an item\'s recipes (or, with uses, what it\'s used in) in the modpack\'s recipe viewer. Recipes come ranked with the main production recipe usually first. End the query with a machine to filter (e.g. "steel ingot ebf", "pe lcr", "signalum dust mixer").',
        parameters: ToolParams.object(
            {
                query: ToolParams.string("Item name, abbreviation or ID, optionally followed by a machine."),
                uses: ToolParams.boolean("List recipes that use the item instead of ones that make it."),
                expert: ToolParams.boolean(
                    "Use expert (hard) mode recipes. Items only in expert mode switch to it on their own."
                )
            },
            ["query"]
        )
    };

    static maxResults = 15;

    static _spaceRegex = /\s+/g;
    static _formWordsRegex =
        /\b(?:tiny pile of|small pile of|block of|hot|dust|ingot|nugget|plate|rod|bolt|screw|ring|gear|foil|wire|gem|bar|sheet|pulp)\b/g;

    getStatus(args) {
        return `Searching recipes for "${this.formatArg(args.query)}"`;
    }

    async execute(args, session) {
        const query = this.requireString(args, "query");

        const expert = session.resolveExpert(args.expert);

        let data = await this._search(query, args, session, expert);

        if (data.error === NomiCodexClient.notFoundError && !expert) {
            const expertData = await this._search(query, args, session, true);

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
            mode: this.recipes.getMode(session.expert),
            item: { id: item.id, name: HTMLUtil.stripTags(item.name) },
            machine: data.machineFilter,
            alternatives: data.alternatives.map(alt => HTMLUtil.stripTags(alt.name))
        };

        if (args.uses) {
            out.uses = data.uses.slice(0, SearchRecipesTool.maxResults).map(use => this._formatUse(use));
            out.totalUses = data.uses.length;
        } else {
            const material = SearchRecipesTool._getMaterial(item.name);

            out.recipes = data.recipes
                .slice(0, SearchRecipesTool.maxResults)
                .map(recipe => this._formatRecipe(recipe, material));

            out.totalRecipes = data.recipes.length;
        }

        return out;
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

    async _search(query, args, session, expert) {
        return await this.recipes.search(query, {
            mode: this.recipes.getMode(expert),
            uses: args.uses ?? false,
            timeout: session.toolTimeout()
        });
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
