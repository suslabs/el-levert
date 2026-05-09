import { EmbedBuilder } from "discord.js";

import { getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import OCUtil from "../../util/commands/OCUtil.js";

import OCTypes from "../../util/commands/OCTypes.js";

import { drawTable } from "../../util/misc/Table.js";

import ParserError from "../../errors/ParserError.js";

function getErrorText(cmd) {
    return `${getEmoji("warn")} Invalid arguments specified. Must be:
${cmd.getArgsHelp("<EU> <duration> [base chance] [chance bonus] {parallel} {amperage}")}

- \`<>\` Required for basic overclocking
- \`[]\` Required for chance calculations
- \`{}\` Required for parallel calculations
- Use \`-\` to skip arguments

For EBF calculations, use:
${cmd.getArgsHelp("ebf <EU> <duration> <recipe heat> <coil heat> {parallel} {amperage}")}`;
}

function formatFieldName(name) {
    return name.replace(/^base_/, "").replaceAll(/_/g, " ");
}

function getParserErrorText(cmd, err) {
    switch (err.ref?.reason) {
        case "missing_args":
            return getErrorText(cmd);
        case "invalid_value":
            return `${getEmoji("warn")} Invalid ${formatFieldName(err.ref.field)}: \`${err.ref.input}\`.
${getErrorText(cmd)}`;
        default:
            return getErrorText(cmd);
    }
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

const recipeFieldIndexes = {
    recipe: {
        base_eu: 0,
        base_duration: 1,
        base_chance: 2,
        base_chance_bonus: 3,
        base_parallel: 4,
        amperage: 5
    },
    ebf: {
        base_eu: 1,
        base_duration: 2,
        base_recipe_heat: 3,
        base_coil_heat: 4,
        base_parallel: 5,
        amperage: 6
    }
};

function parseInput(split) {
    const args = split.map(value => (value === "-" ? null : value));

    if (args.length < 2) {
        throw new ParserError("Overclock input requires at least EU and duration", {
            reason: "missing_args",
            args,
            argCount: args.length
        });
    }

    let recipe = null;
    let inputIndexes = null;

    if (args[0] === "ebf") {
        inputIndexes = recipeFieldIndexes.ebf;
        const ocType = args[5] ? OCTypes.ebfParallel : OCTypes.ebf;

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
        inputIndexes = recipeFieldIndexes.recipe;
        const ocType = args[4] ? OCTypes.parallel : OCTypes.recipe;

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

    for (const [field, range] of Object.entries(bounds)) {
        if (TypeTester.outOfRange(field, ...range, recipe)) {
            throw new ParserError("Overclock input value out of range", {
                reason: "invalid_value",
                field,
                input: args[inputIndexes[field]],
                value: recipe[field],
                bounds: range
            });
        }
    }

    return recipe;
}

function codeblock(str) {
    return `\`\`\`lua\n${str}\`\`\``;
}

class OverclockCommand {
    static info = {
        name: "overclock",
        aliases: ["oc"],
        category: "util",
        arguments: [
            {
                name: "parts",
                parser: "words"
            },
            {
                name: "recipe",
                from: "parts",
                parser: parts => parseInput(parts)
            }
        ]
    };

    handler(ctx) {
        let split, recipe;

        try {
            split = ctx.arg("parts");
            recipe = ctx.arg("recipe");
        } catch (err) {
            if (err.name !== "ParserError") {
                throw err;
            }

            return getParserErrorText(this, err);
        }

        if (Util.empty(split)) {
            return getErrorText(this);
        }

        const outputs = OCUtil.overclock(recipe);

        if (Util.empty(outputs)) {
            return `${getEmoji("warn")} Could not calculate. No voltage matches the input EU.`;
        }

        const hasParallel = recipe.oc_type.includes("parallel"),
            hasChance = outputs.findIndex(row => Boolean(row.chance)) !== -1;

        const header = `${getEmoji("info")} Input: **${recipe.base_eu} EU/t** for **${OCUtil.formatDuration(recipe.base_duration)}**`;

        const columns = {
                eu: "EU/t",
                time: "Time",
                tier: "Voltage",
                ...(hasChance ? { chance: "Chance" } : {}),
                ...(hasParallel ? { parallel: "Parallel" } : {})
            },
            rows = {
                eu: outputs.map(row => Util.formatNumber(row.eu, 3) + " EU/t"),
                time: outputs.map(row => OCUtil.formatDuration(row.time)),
                tier: outputs.map(row => OCUtil.getTierName(row.tier)),
                ...(hasChance ? { chance: outputs.map(row => Util.round(row.chance, 3) + "%") } : {}),
                ...(hasParallel ? { parallel: outputs.map(row => row.parallel + "x") } : {})
            };

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
}

export default OverclockCommand;
