import AITool from "../AITool.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import Util from "../../../util/Util.js";
import ToolParams from "../../../util/ai/ToolParams.js";
import Overclocking from "../../../util/commands/overclocking/Overclocking.js";
import OverclockingModes from "../../../util/commands/overclocking/OverclockingModes.js";

class OverclockTool extends AITool {
    // the modes that apply to Nomifactory CEu; ce and macerator emulate the older GTCE
    static modes = [OverclockingModes.standard, OverclockingModes.ebf, OverclockingModes.lcr];

    static info = {
        name: "overclock",
        emoji: "⚡",
        phase: AIPhases.calculating,
        description:
            "The %oc overclock calculator: EU/t, duration, chanced output and parallels at every tier for a recipe's real EU/t and duration.",
        parameters: ToolParams.object(
            {
                eu: ToolParams.number("Recipe EU/t."),
                duration: ToolParams.string('Duration, e.g. "30s" or "600t".'),
                mode: ToolParams.string("ebf needs recipeHeat and coilHeat; lcr is perfect overclocking.", {
                    enum: OverclockTool.modes
                }),
                recipeHeat: ToolParams.integer("EBF recipe heat (K)."),
                coilHeat: ToolParams.integer("EBF coil heat (K)."),
                chance: ToolParams.number("Base chance of a chanced output, 0-100."),
                chanceBonus: ToolParams.number("Chance bonus per tier, 0-100."),
                parallel: ToolParams.integer("Parallel recipes."),
                amperage: ToolParams.integer("Amps (default 1)."),
                voltage: ToolParams.string('Only this tier, e.g. "HV".')
            },
            ["eu", "duration"]
        )
    };

    getStatus(args) {
        return `Overclocking ${this.formatArg(args.eu)} EU/t for ${this.formatArg(args.duration)}`;
    }

    execute(args) {
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
            hasParallel: typeof args.parallel !== "undefined",
            voltage: Util.nonemptyString(args.voltage) ? args.voltage : null
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
