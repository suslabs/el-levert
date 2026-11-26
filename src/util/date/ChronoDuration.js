import path from "node:path";
import { createRequire } from "node:module";

import Util from "../Util.js";

const require = createRequire(import.meta.url),
    chronoDir = path.dirname(require.resolve("chrono-node"));

const { NUMBER_PATTERN, TIME_UNIT_DICTIONARY, parseNumberPattern } = require(
    path.join(chronoDir, "locales", "en", "constants.js")
);

let ChronoDuration = {
    units: new Map([
        ...Object.entries(TIME_UNIT_DICTIONARY),
        ["ms", "milli"],
        ["milli", "milli"],
        ["millis", "milli"],
        ["millisecond", "milli"],
        ["milliseconds", "milli"],
        ["secs", "second"],
        ["wk", "week"],
        ["wks", "week"],
        ["yrs", "year"]
    ]),

    names: new Map([
        ["hourly", "hour"],
        ["daily", "day"],
        ["weekly", "week"],
        ["monthly", "month"],
        ["yearly", "year"]
    ]),

    read: text => {
        text = text.trim();
        let rest = text;

        const parts = [];

        while (!Util.empty(rest)) {
            const match = rest.match(ChronoDuration._tokenRegex);

            if (match === null) {
                break;
            }

            const [span, separator, amount, alias] = match;

            if (Util.empty(parts) && !Util.empty(separator)) {
                return null;
            }

            const count = parseNumberPattern(amount);

            if (!Number.isFinite(count) || count <= 0) {
                return null;
            }

            parts.push([ChronoDuration.units.get(alias.toLowerCase()), count]);
            rest = rest.slice(span.length);
        }

        if (!Util.empty(parts)) {
            return { parts, rest: rest.trim(), named: false };
        }

        const match = text.match(ChronoDuration._bareUnitRegex);

        if (match === null) {
            return null;
        }

        const [span, alias] = match,
            unit = alias.toLowerCase();

        return {
            parts: [[ChronoDuration.names.get(unit) ?? ChronoDuration.units.get(unit), 1]],
            rest: text.slice(span.length).trim(),
            named: ChronoDuration.names.has(unit)
        };
    }
};

{
    const joinPatterns = keys => [...keys].sort((a, b) => b.length - a.length).join("|"),
        unitPattern = joinPatterns(ChronoDuration.units.keys()),
        barePattern = joinPatterns([...ChronoDuration.names.keys(), ...ChronoDuration.units.keys()]);

    ChronoDuration._tokenRegex = new RegExp(
        `^(?:([\\s,]*(?:and\\s+)?))?(${NUMBER_PATTERN})\\s*(${unitPattern})(?=\\d|\\W|$)`,
        "i"
    );
    ChronoDuration._bareUnitRegex = new RegExp(`^(${barePattern})(?=\\s|$)`, "i");
}

ChronoDuration = Object.freeze(ChronoDuration);
export default ChronoDuration;
