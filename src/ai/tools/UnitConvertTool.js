import AITool from "./AITool.js";
import ToolParams from "./ToolParams.js";

import { OverclockingValues } from "../../structures/OverclockingValues.js";

import AIPhases from "../AIPhases.js";

import Util from "../../util/Util.js";
import ConversionUtil from "../../util/commands/ConversionUtil.js";

class UnitConvertTool extends AITool {
    static info = {
        name: "unit_convert",
        phase: AIPhases.calculating,
        description:
            "Convert between mB, bucket (B), mB/t, mB/s, B/t, B/s, EU/t, RF/t (FE/t), AE/t, their per-second forms and voltage tier amps (e.g. MV).",
        parameters: ToolParams.object(
            {
                value: ToolParams.number("Amount to convert."),
                from: ToolParams.string('Source unit, e.g. "mB/t".'),
                to: ToolParams.string('Target unit, e.g. "B/s".')
            },
            ["value", "from", "to"]
        )
    };

    static resultDigits = 6;

    static unitAliases = {
        fe: "rf",
        bucket: "b",
        buckets: "b",
        millibucket: "mb",
        millibuckets: "mb",
        l: "mb"
    };

    getStatus(args) {
        return `Converting ${this.formatArg(args.value)} ${this.formatArg(args.from)} to ${this.formatArg(args.to)}`;
    }

    execute(args) {
        const from = this._parseUnit(args.from),
            to = this._parseUnit(args.to);

        if (from === null || to === null) {
            const invalid = from === null ? args.from : args.to;

            return {
                error: `Unknown unit "${invalid}". Valid units: ${ConversionUtil.validUnits.join(", ")} (optionally /t or /s).`
            };
        }

        const perTick = this._toPerTick(args.value, from),
            converted = ConversionUtil.convertValue(perTick, from.unit, to.unit),
            result = Util.round(this._fromPerTick(converted, to), UnitConvertTool.resultDigits);

        const assumptions = [];

        if (from.perSecond !== to.perSecond) {
            assumptions.push(`${OverclockingValues.ticksPerSecond} ticks per second (no lag)`);
        }

        return {
            input: `${args.value} ${args.from}`,
            result,
            output: `${result} ${args.to}`,
            assumptions
        };
    }

    static _unitRegex = /^([a-z]+)(?:\/(t|s|tick|sec|second))?$/;

    _parseUnit(raw) {
        const match = String(raw ?? "")
            .toLowerCase()
            .replaceAll(" ", "")
            .match(UnitConvertTool._unitRegex);

        if (match === null) {
            return null;
        }

        const [, name, time] = match,
            unit = UnitConvertTool.unitAliases[name] ?? name;

        if (!ConversionUtil.validUnits.includes(unit)) {
            return null;
        }

        return {
            unit,
            perSecond: typeof time !== "undefined" && time.startsWith("s")
        };
    }

    _toPerTick(value, unit) {
        return unit.perSecond ? value / OverclockingValues.ticksPerSecond : value;
    }

    _fromPerTick(value, unit) {
        return unit.perSecond ? value * OverclockingValues.ticksPerSecond : value;
    }
}

export default UnitConvertTool;
