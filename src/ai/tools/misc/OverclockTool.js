import AITool from "../AITool.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import Util from "../../../util/Util.js";
import ToolParams from "../../../util/ai/ToolParams.js";
import Overclocking from "../../../util/commands/overclocking/Overclocking.js";
import OverclockingModes from "../../../util/commands/overclocking/OverclockingModes.js";

class OverclockTool extends AITool {
    static info = {
        name: "overclock",
        emoji: "⚡",
        phase: AIPhases.calculating,
        description:
            "Run the bot's GregTech overclock calculator (the %oc command) for a recipe: EU/t, duration, chanced output and parallels at every voltage tier. Use the recipe's real EU/t and duration, e.g. from search_recipes.",
        parameters: ToolParams.object(
            {
                eu: ToolParams.number("Recipe EU/t."),
                duration: ToolParams.string('Recipe duration in seconds or ticks, e.g. "30s" or "600t".'),
                mode: ToolParams.string(
                    `Overclock mode: ${OverclockingModes.values.join(", ")} (default standard). ebf needs recipeHeat and coilHeat; lcr is perfect overclocking.`
                ),
                recipeHeat: ToolParams.integer("EBF recipe heat in K."),
                coilHeat: ToolParams.integer("EBF coil heat in K."),
                chance: ToolParams.number("Base chance of a chanced output, 0-100."),
                chanceBonus: ToolParams.number("Chance bonus per tier, 0-100."),
                parallel: ToolParams.integer("Parallel recipes the machine runs."),
                amperage: ToolParams.integer("Amps available (default 1)."),
                voltage: ToolParams.string('Only show this tier, e.g. "HV".'),
                rates: ToolParams.boolean("Also show recipes per second."),
                subtick: ToolParams.boolean("Allow subtick overclocking past 1 tick."),
                tape: ToolParams.boolean("Apply the maintenance tape bonus (0.9x duration).")
            },
            ["eu", "duration"]
        )
    };

    getStatus(args) {
        return `Overclocking ${this.formatArg(args.eu)} EU/t for ${this.formatArg(args.duration)}`;
    }

    execute(args) {
        const subtick = args.subtick ?? false;

        const oc = new Overclocking({
            mode: args.mode ?? OverclockingModes.standard,
            eu: args.eu,
            duration: args.duration,
            recipeHeat: args.recipeHeat ?? null,
            coilHeat: args.coilHeat ?? null,
            chance: args.chance ?? 0,
            chanceBonus: args.chanceBonus ?? 0,
            parallel: args.parallel ?? 1,
            amperage: args.amperage ?? 1,
            hasParallel: typeof args.parallel !== "undefined" || subtick,
            voltage: Util.nonemptyString(args.voltage) ? args.voltage : null,
            rates: args.rates ?? false,
            subtick,
            tape: args.tape ?? false
        });

        return {
            input: `${Util.formatNumber(oc.eu, 3)} EU/t for ${Overclocking.formatDuration(oc.duration)}`,
            mode: oc.mode,
            table: oc.generateTable(),
            notes: oc.notes
        };
    }
}

export default OverclockTool;
