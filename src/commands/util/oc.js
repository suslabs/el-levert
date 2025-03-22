import { EmbedBuilder } from "discord.js";

import Util from "../../util/Util.js";
import OCUtil from "../../util/commands/OCUtil.js";
import { drawTable } from "../../util/misc/Table.js";

function getErrorEmbed(cmd) {
    return new EmbedBuilder().setTitle(":warning: Could not calculate.")
        .setDescription(`Invalid arguments specified, must be:
\`${cmd.getArgsHelp()} <EU> <duration> [base chance] [chance bonus] {parallel} {amperage}\`

\`<>\` Required for basic overclocking
\`[]\` Required for chance calculations
\`{}\` Required for parallel calculations
Use \`-\` to skip arguments

For EBF calculations, use:
\`${cmd.getArgsHelp()} ebf <EU> <duration> <eecipe heat> <coil heat> {parallel} {amperage}\``);
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
    const args = split.map(value => (value !== "-" ? value : null));

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
        if (Util.outOfRange(name, ...bound, recipe)) {
            return null;
        }
    }

    return recipe;
}

function codeblock(str) {
    return `\`\`\`lua\n${str}\`\`\``;
}

export default {
    name: "oc",
    category: "util",

    handler: function (args) {
        if (Util.empty(args)) {
            return {
                embeds: [getErrorEmbed(this)]
            };
        }

        const split = args.split(" "),
            recipe = parseInput(split);

        if (recipe === null) {
            return {
                embeds: [getErrorEmbed(this)]
            };
        }

        let footer = `Applicable for NFu, tiers adjusted for actual machine tier,
        for all options and syntax see ${this.getArgsHelp()}.`;

        if (recipe.oc_type.includes("parallel")) {
            footer += `\n\nFor parallelization, it is assumed that you are running 1A of the specified tier.
Manually specify the amperage if it differs.`;
        }

        const outputs = OCUtil.overclock(recipe);

        const hasChance = outputs.findIndex(row => Boolean(row.chance)) !== -1,
            hasParallel = Boolean(Util.first(outputs).parallel);

        const embed = new EmbedBuilder()
            .setTitle(`:information_source: ${recipe.base_eu} EU/t for ${OCUtil.formatDuration(recipe.base_duration)}`)
            .setFooter({
                text: footer
            });

        const columns = {
            eu: "EU/t",
            time: "Time",
            tier: "Voltage"
        };

        const rows = {
            eu: outputs.map(row => row.eu.toLocaleString() + " EU/t"),
            time: outputs.map(row => OCUtil.formatDuration(row.time)),
            tier: outputs.map(row => OCUtil.getTierName(row.tier))
        };

        if (hasChance) {
            columns.chance = "Chance";
            rows.chance = outputs.map(row => row.chance + "%");
        }

        if (hasParallel) {
            columns.parallel = "Parallel";
            rows.parallel = outputs.map(row => row.parallel + "x");
        }

        const table = drawTable(columns, rows, undefined, {
            sideLines: false
        });

        embed.setDescription(codeblock(table));

        return {
            embeds: [embed]
        };
    }
};
