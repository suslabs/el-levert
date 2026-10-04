import { EmbedBuilder } from "discord.js";

import { getEmoji } from "../../LevertClient.js";

import { OverclockingValues } from "../../structures/OverclockingValues.js";

import Util from "../../util/Util.js";
import Overclocking from "../../util/commands/overclocking/Overclocking.js";
import OverclockingModes from "../../util/commands/overclocking/OverclockingModes.js";
import OverclockArgumentParser from "../../util/commands/overclocking/OverclockArgumentParser.js";

import ParserError from "../../errors/ParserError.js";
import OCError from "../../errors/OCError.js";

function codeblock(str) {
    return `\`\`\`lua\n${str}\`\`\``;
}

function getUsageText(cmd) {
    return `${getEmoji("warn")} Invalid arguments specified. Use:
${cmd.getArgsHelp("[mode] <EU> <duration> [base chance] [chance bonus] [parallel] [amperage]")}

EBF mode:
${cmd.getArgsHelp("ebf <EU> <duration> <recipe heat> <coil heat> [parallel] [amperage]")}

Modes: ${OverclockArgumentParser.modes.join(", ")}
Default mode: ${OverclockingModes.standard}.
Use \`-\` to skip an optional positional argument.`;
}

function formatFieldName(name) {
    return Util.camelCaseToWords(name).replaceAll(/_/g, " ");
}

function getParserErrorText(cmd, err) {
    switch (err.ref?.reason) {
        case "missing_args":
            return `${getEmoji("warn")} Missing required argument: **${formatFieldName(err.ref.field)}**.\n\n${getUsageText(cmd)}`;
        case "invalid_mode":
            return `${getEmoji("warn")} Invalid recipe mode: \`${err.ref.mode}\`.\n\n${getUsageText(cmd)}`;
        case "invalid_value":
            return `${getEmoji("warn")} Invalid **${formatFieldName(err.ref.field)}**: \`${err.ref.input}\`.\n\n${getUsageText(cmd)}`;
        default:
            return getUsageText(cmd);
    }
}

function getCalculationErrorText(err) {
    switch (err.ref?.reason) {
        case "invalid_voltage":
            return `${getEmoji("warn")} Invalid voltage specified: \`${err.ref.voltage}\`. Valid voltages are: **${OverclockingValues.voltageNames.join("**, **")}**.`;
        case "ce_no_uev":
            return `${getEmoji("warn")} Nomifactory CE does not have UEV+ voltage; voltages in Nomifactory cap to MAX (same as UHV).`;
        case "no_voltage_match":
        case "no_output":
            return `${getEmoji("warn")} Could not calculate. No supported voltage tier matches the input EU: \`${err.ref.eu}\`.`;
        default:
            return `${getEmoji("warn")} ${err.message}.`;
    }
}

function resolveVoltage(ctx) {
    const directVoltage = ctx.arg("voltage");

    if (Util.nonemptyString(directVoltage)) {
        return directVoltage;
    }

    for (const name of OverclockingValues.voltageNames) {
        if (ctx.arg(name.toLowerCase()) === true) {
            return name;
        }
    }

    return null;
}

function buildConfig(recipe, ctx) {
    const subtick = ctx.arg("subtick") === true,
        inputAmount = ctx.arg("input"),
        outputAmount = ctx.arg("output");

    return {
        ...recipe,
        tape: ctx.arg("tape") === true,
        subtick,
        extra: ctx.arg("extra") === true,
        tick: ctx.arg("tick") === true,
        rf: ctx.arg("rf") === true,
        rates: ctx.arg("rates") === true || inputAmount != null || outputAmount != null,
        text: ctx.arg("text") === true,
        auto: ctx.arg("auto") === true,
        voltage: resolveVoltage(ctx),
        timeMultiplier: ctx.arg("time") ?? 1,
        euMultiplier: ctx.arg("eu") ?? 1,
        count: ctx.arg("count") ?? 1,
        inputAmount,
        outputAmount,
        hasParallel: recipe.parallel != null || subtick
    };
}

function renderOutput(oc) {
    if (oc.auto) {
        return JSON.stringify(oc.outputs);
    }

    const table = oc.generateTable();

    if (oc.text) {
        return codeblock(table);
    }

    const header = `${getEmoji("info")} Input: **${Util.formatNumber(oc.eu, 3)} EU/t** for **${Overclocking.formatDuration(oc.duration)}**`;

    let footer = oc.isCe
        ? "Applicable for GTCE,\ntiers adjusted for actual machine tier,\nUse a 4A CEF and a MAX energy hatch for MAX"
        : "Applicable for NFu,\ntiers adjusted for actual machine tier";

    if (oc.hasParallel) {
        footer += `\n\nFor parallelization, it is assumed that you are running ${oc.amperage}A of the specified tier.\nManually specify the amperage if it differs.`;
    }

    const embed = new EmbedBuilder().setFooter({ text: footer }).setDescription(codeblock(table));

    return {
        content: header,
        embeds: [embed]
    };
}

function runRecipe(cmd, input, ctx) {
    let recipe;

    try {
        recipe = new OverclockArgumentParser().parse(input);
    } catch (err) {
        if (!(err instanceof ParserError)) {
            throw err;
        }

        return getParserErrorText(cmd, err);
    }

    let oc;

    try {
        oc = new Overclocking(buildConfig(recipe, ctx));
    } catch (err) {
        if (!(err instanceof OCError)) {
            throw err;
        }

        return getCalculationErrorText(err);
    }

    return renderOutput(oc);
}

function runBulk(cmd, input, ctx) {
    const lines = input.split(/\r?\n/).filter(line => !Util.empty(line.trim())),
        outputs = [];

    for (let i = 0; i < lines.length; i++) {
        const lineContext = ctx.withArgs(lines[i]),
            result = runRecipe(cmd, lineContext.arg("parts"), ctx);

        outputs.push(`Recipe ${i + 1}:\n${typeof result === "string" ? result : JSON.stringify(result)}`);
    }

    return outputs.join("\n\n");
}

class OverclockCommand {
    static info = {
        name: "overclock",
        description: "Calculate overclocking requirements.",
        usage: `[mode] <eu> <duration> [chance] [chance_bonus] [parallel] [amperage]
ebf <eu> <duration> <recipe_heat> <coil_heat> [parallel] [amperage]

Modes: ${OverclockArgumentParser.modes.join(", ")}
Default mode: ${OverclockingModes.standard}.
Modifiers: --tape, --subtick, --extra, --rf
Output: --voltage, --rates, --input, --output, --count, --tick, --text, --auto, --bulk.`,
        aliases: ["oc", "oceu"],
        helpArgs: ["help", "-help", "-h", "--help", "usage"],
        category: "util",
        arguments: [
            {
                name: "tape",
                kind: "option",
                type: "boolean"
            },
            {
                name: "subtick",
                kind: "option",
                type: "boolean"
            },
            {
                name: "extra",
                kind: "option",
                type: "boolean"
            },
            {
                name: "tick",
                kind: "option",
                type: "boolean"
            },
            {
                name: "rf",
                kind: "option",
                type: "boolean"
            },
            {
                name: "rates",
                kind: "option",
                type: "boolean"
            },
            {
                name: "text",
                kind: "option",
                type: "boolean"
            },
            {
                name: "auto",
                kind: "option",
                type: "boolean"
            },
            {
                name: "bulk",
                kind: "option",
                type: "boolean"
            },
            {
                name: "voltage",
                kind: "option",
                type: "string"
            },
            {
                name: "time",
                kind: "option",
                type: "number"
            },
            {
                name: "eu",
                kind: "option",
                type: "number"
            },
            {
                name: "count",
                kind: "option",
                type: "integer"
            },
            {
                name: "input",
                kind: "option",
                type: "number"
            },
            {
                name: "output",
                kind: "option",
                type: "number"
            },
            ...OverclockingValues.voltageNames.map(name => ({
                name: name.toLowerCase(),
                kind: "option",
                type: "boolean"
            })),
            {
                name: "parts",
                kind: "list"
            },
            {
                name: "recipes",
                kind: "rest"
            }
        ]
    };

    handler(ctx) {
        const parts = ctx.arg("parts"),
            recipes = ctx.arg("recipes");

        if (Util.empty(parts)) {
            return getUsageText(this);
        }

        if (ctx.arg("bulk") === true) {
            return runBulk(this, recipes, ctx);
        }

        return runRecipe(this, parts, ctx);
    }
}

export default OverclockCommand;
