import { EmbedBuilder } from "discord.js";

import Util from "../../util/Util.js";
import CleanroomUtil from "../../util/commands/CleanroomUtil.js";

export default {
    name: "cleanroomcalc",
    aliases: ["crc"],
    category: "util",

    handler: args => {
        const split = args.split("x"),
            dims = split.map(d => Util.parseInt(d));

        if (split.length !== 3) {
            return `:warning: Invalid arguments specified. All dimensions must be provided in \`LxWxH\` format.`;
        } else if (dims.some(d => Number.isNaN(d))) {
            return `:warning: Invalid dimensions: \`${args}\`.`;
        }

        let info;

        try {
            info = CleanroomUtil.calc(dims);
        } catch (err) {
            if (err.name !== "UtilError") {
                throw err;
            }

            if (err.message.includes("at least")) {
                return `:warning: Cleanroom size must be at least **${CleanroomUtil.minSize.join("x")}**.`;
            } else if (err.message.includes("bigger")) {
                return `:warning: Cleanroom cannot be bigger than **${CleanroomUtil.maxSize.join("x")}**.`;
            } else {
                return `:warning: ${err.message}.`;
            }
        }

        const header = `:information_source: Resources required for a \`${args}\` cleanroom:`;

        const embed = new EmbedBuilder()
            .addFields(
                {
                    name: "Cleanroom controller:",
                    value: "- " + Util.formatNumber(info.controller)
                },
                {
                    name: "Plascrete frame:",
                    value: "- " + Util.formatNumber(info.frame),
                    inline: true
                },
                {
                    name: "Plascrete or glass walls:",
                    value: "- " + Util.formatNumber(info.walls),
                    inline: true
                },
                {
                    name: "Filter casings:",
                    value: "- " + Util.formatNumber(info.filters),
                    inline: true
                }
            )
            .setFooter({
                text: "Subtract any hatches you want in the walls from the frame or wall amount."
            });

        return {
            content: header,
            embeds: [embed]
        };
    }
};
