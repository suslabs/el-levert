import NomiCodexClient from "../../ai/sources/NomiCodexClient.js";
import Sources from "../../ai/sources/Sources.js";

import { getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import PaginationUtil from "../../util/commands/PaginationUtil.js";
import PickerUtil from "../../util/commands/PickerUtil.js";
import RecipeView from "../../util/commands/RecipeView.js";
import HTTPUtil from "../../util/vm/HTTPUtil.js";

import AIError from "../../errors/AIError.js";

const flags = Object.freeze({
    "--uses": "uses",
    "--use": "uses",
    "--expert": "expert",
    "--light": "light",
    "--list": "list"
});
const numberedItem = /\b(?:tier|mk|mark|level|stage|grade|class|rank|miners?)$/i;

function parseQuery(parts) {
    const options = { uses: false, expert: false, light: false, list: false };
    const words = [];

    for (const part of parts) {
        const flag = typeof part === "string" && Object.hasOwn(flags, part) ? flags[part] : null;

        if (flag === null) {
            words.push(part);
        } else {
            options[flag] = true;
        }
    }

    const last = words.at(-1);
    let number = null;

    if (Util.multiple(words) && typeof last === "string" && /^\d+$/.test(last) && !numberedItem.test(words.at(-2))) {
        number = Number(words.pop());
    }

    return { ...options, query: words.join(" ").trim(), number };
}

class RecipeCommand {
    static searchTimeout = 8 / Util.durationSeconds.milli;

    static info = {
        name: "rp",
        category: "util",
        args: "<item> [machine] [--uses] [--expert] [--light] [--list]",
        description: "Looks up Nomifactory CEu recipes and item uses in NomiCodex.",
        usage: "- Add a machine name to filter results.\n- --uses: Find recipes that consume the item.\n- --expert: Look up expert mode recipes.\n- --light: Use the light theme for cards.\n- --list: Always show the result list.",
        arguments: [Util.first(PaginationUtil.getPaginationArguments()), { name: "parts", kind: "list" }]
    };

    load() {
        this.source = new NomiCodexClient(HTTPUtil.createAxiosClient(), Sources.nomiCodex.options);
    }

    async handler(ctx) {
        const args = parseQuery(ctx.arg("parts"));

        if (Util.empty(args.query)) {
            return RecipeView.help(`${this.prefix}${this.name}`);
        }

        const mode = this.source.getMode(args.expert);

        try {
            const data = await this.source.search(args.query, {
                mode,
                uses: args.uses,
                timeout: RecipeCommand.searchTimeout
            });
            return await new RecipeView(this.source, data, { ...args, mode }).reply(ctx);
        } catch (err) {
            if (!(err instanceof AIError)) {
                throw err;
            }

            return RecipeView.notice(`${getEmoji("warn")} ${err.message}.`);
        }
    }

    async interactionHandler(ctx) {
        return await PickerUtil.handleInteraction(ctx);
    }
}

export default RecipeCommand;
