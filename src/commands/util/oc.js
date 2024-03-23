import table from "../../util/AsciiTable.js";

import GregicUtil from "../../oc/GregicUtil.js";

export default {
    name: "oc",
    handler: (args, msg) => {
        if (args.length === 0) {
            return ":information_source: %oc (-version) [EU/t] [duration]";
        }

        const split = args.split(" ");
        let type = "ceu",
            eu,
            dur;

        switch (split.length) {
            case 2:
                eu = parseInt(split[0]);
                dur = parseInt(split[1]);
                break;
            case 3:
                type = split[0].slice(1);

                if (!split[0].includes("-") || !Object.keys(GregicUtil.allTiers).includes(type)) {
                    return `:warning: Invalid version: \`${type}\``;
                }

                eu = parseInt(split[1]);
                dur = parseInt(split[2]);
                break;
            default:
                return ":warning: Invalid argument count.";
        }

        if (isNaN(eu) || eu < 1) {
            return ":warning: Invalid EU/t.";
        }

        if (isNaN(dur) || dur <= 0) {
            return ":warning: Invalid duration.";
        }

        const oc = GregicUtil.oc(eu, dur, type);

        const outEu = oc.map(x => x.eu.toLocaleString() + " EU/t"),
            outTime = oc.map(x => {
                if (x.t_dur < 10) {
                    return x.t_dur.toLocaleString() + "t";
                } else {
                    return x.dur.toLocaleString() + "s";
                }
            }),
            outTier = oc.map(x => x.tier);

        const columns = {
                eu: "EU/t",
                time: "Time",
                tier: "Voltage"
            },
            rows = {
                eu: outEu,
                time: outTime,
                tier: outTier
            };

        const ocTable = table(columns, rows, "doubleVertical", 1);

        let footer = "";

        if (type === "nomi") {
            footer = "MAX is only available in dev, and only for multiblocks.";
        }

        const out = `:information_source: Input: ${eu} EU/t for ${dur}s
\`\`\`lua
${ocTable}
\`\`\`
${footer}`;

        return out;
    }
};
