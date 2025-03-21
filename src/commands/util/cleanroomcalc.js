import { EmbedBuilder } from "discord.js";

import Util from "../../util/Util.js";
import CleanroomUtil from "../../util/commands/CleanroomUtil.js";

export default {
    name: "cleanroomcalc",
    category: "util",

    handler: args => {
        const dims = args.split("x");

        if (dims.length !== 3) {
            return ":warning: Must specify all dimensions in `LxWxH` format.";
        }

        const l = Util.parseInt(dims[0]),
            w = Util.parseInt(dims[1]),
            h = Util.parseInt(dims[2]);

        if ((Number.isNaN(l) || Number.isNaN(w) || Number, isNaN(h))) {
            return `:warning: Invalid dimensions: \`${dims[0]}\`x\`${dims[1]}\`x\`${dims[2]}\`.`;
        }

        let info;

        try {
            info = CleanroomUtil.calc(l, w, h);
        } catch (err) {
            if (err.name === "UtilError") {
                return `:warning: ${err.message}.`;
            }

            throw err;
        }

        const { frame, walls, filters } = info;

        const embed = new EmbedBuilder()
            .addFields(
                {
                    name: "Cleanroom controller:",
                    value: "- 1"
                },
                {
                    name: "Plascrete frame:",
                    value: "- " + frame.toLocaleString()
                },
                {
                    name: "Plascrete or glass walls:",
                    value: "- " + walls.toLocaleString()
                },
                {
                    name: "Filter casings:",
                    value: "- " + filters.toLocaleString()
                }
            )
            .setFooter({
                text: "Subtract any hatches you want in the walls from the Frame or Wall amount."
            });

        const out = {
            content: `:information_source: Resources required for a ${l}x${w}x${h} cleanroom:`,
            embeds: [embed]
        };

        return out;
    }
};
