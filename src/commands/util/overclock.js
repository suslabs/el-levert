import { EmbedBuilder } from "discord.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import OCUtil from "../../util/commands/OCUtil.js";

import { drawTable } from "../../util/misc/Table.js";

function getErrorText(cmd) {
    return `:warning: Invalid arguments specified. Must be:
${cmd.getArgsHelp("<EU> <duration> [base chance] [chance bonus] {parallel} {amperage}")}

- \`<>\` Required for basic overclocking
- \`[]\` Required for chance calculations
- \`{}\` Required for parallel calculations
- Use \`-\` to skip arguments

For EBF calculations, use:
${cmd.getArgsHelp("ebf <EU> <duration> <recipe heat> <coil heat> {parallel} {amperage}")}`;
}

const bounds = {
    base_eu: [1, Infinity],
    base_duration: [1, Infinity],
    base_chance: [0, 100],
    base_chance_bonus: [0, 100],
    base_recipe_heat: [1, Infinity],
    base_coil_heat: [1, Infinity],
    base_parallel: [0, Infinity],
    amperage: [1, Infinity]
};

function parseInput(split) {
    const args = split.map(value => (value === "-" ? null : value));

    if (args.length < 2) {
        return null;
    }

    let recipe;

    if (args[0] === "ebf") {
        const ocType = args[5] ? "ebf parallel" : "ebf";

        recipe = {
            base_eu: Util.parseInt(args[1]),
            base_duration: OCUtil.parseDuration(args[2]),
            base_recipe_heat: Util.parseInt(args[3]),
            base_coil_heat: Util.parseInt(args[4]),
            base_parallel: Util.parseInt(args[5], 10, 0),
            amperage: Util.parseInt(args[6], 10, 1),
            oc_type: ocType
        };
    } else {
        const ocType = args[4] ? "parallel" : "recipe";

        recipe = {
            base_eu: Util.parseInt(args[0]),
            base_duration: OCUtil.parseDuration(args[1]),
            base_chance: Number.parseFloat(args[2] ?? 0),
            base_chance_bonus: Number.parseFloat(args[3] ?? 0),
            base_parallel: Util.parseInt(args[4], 10, 0),
            amperage: Util.parseInt(args[5], 10, 2),
            oc_type: ocType
        };
    }

    for (const [name, bound] of Object.entries(bounds)) {
        if (TypeTester.outOfRange(name, ...bound, recipe)) {
            return null;
        }
    }

    return recipe;
}

function codeblock(str) {
    return `\`\`\`lua\\n${str}\`\`\``;
}

export default {
    name: "overclock",
    aliases: ["oc"],
    category: "util",

    handler: function (args) {
        if (Util.empty(args)) {
            return getErrorText(this);
        }

        const split = args.split(" "),
            recipe = parseInput(split);

        if (recipe === null) {
            return getErrorText(this);
        }

        const outputs = OCUtil.overclock(recipe);

        if (Util.empty(outputs)) {
            return ":warning: Could not calculate. No voltage matches the input EU.";
        }

        const hasParallel = recipe.oc_type.includes("parallel"),
            hasChance = outputs.findIndex(row => Boolean(row.chance)) !== -1;

        const header = `:information_source: Input: **${recipe.base_eu} EU/t** for **${OCUtil.formatDuration(recipe.base_duration)}**`;

        const columns = {
            eu: "EU/t",
            time: "Time",
            tier: "Voltage"
        };

        const rows = {
            eu: outputs.map(row => Util.formatNumber(row.eu, 3) + " EU/t"),
            time: outputs.map(row => OCUtil.formatDuration(row.time)),
            tier: outputs.map(row => OCUtil.getTierName(row.tier))
        };

        if (hasChance) {
            columns.chance = "Chance";
            rows.chance = outputs.map(row => Util.round(row.chance, 3) + "%");
        }

        if (hasParallel) {
            columns.parallel = "Parallel";
            rows.parallel = outputs.map(row => row.parallel + "x");
        }

        const table = drawTable(columns, rows, "light", {
            sideLines: false
        });

        let footer = `Applicable for NFu, tiers adjusted for actual machine tier,
for all options and syntax see ${this.getArgsHelp()}.`;

        if (hasParallel) {
            footer += `\n\nFor parallelization, it is assumed that you are running 1A of the specified tier.
Manually specify the amperage if it differs.`;
        }

        const embed = new EmbedBuilder().setFooter({ text: footer }).setDescription(codeblock(table));

        return {
            content: header,
            embeds: [embed]
        };
    }
};
