import { EmbedBuilder } from "discord.js";

import { getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import CleanroomUtil from "../../util/commands/CleanroomUtil.js";

import ParserError from "../../errors/ParserError.js";

function parseDimensions(argsText) {
    const split = `${argsText ?? ""}`.split("x");

    if (split.length !== 3) {
        throw new ParserError("All cleanroom dimensions must be provided", {
            reason: "missing_dimensions",
            input: argsText,
            parts: split
        });
    }

    const dimensions = split.map(part => Util.parseInt(part));

    if (dimensions.some(dimension => Number.isNaN(dimension))) {
        throw new ParserError("Cleanroom dimensions must be numbers", {
            reason: "invalid_dimensions",
            input: argsText,
            dimensions
        });
    }

    return dimensions;
}

class CleanroomCalcCommand {
    static info = {
        name: "cleanroomcalc",
        aliases: ["crc"],
        category: "util",
        arguments: [
            {
                name: "dimensions",
                parser: parseDimensions
            }
        ]
    };

    handler(ctx) {
        let dims;

        try {
            dims = ctx.arg("dimensions");
        } catch (err) {
            if (err.name !== "ParserError") {
                throw err;
            }

            switch (err.ref?.reason) {
                case "missing_dimensions":
                    return `${getEmoji("warn")} Invalid arguments specified. All dimensions must be provided in \`LxWxH\` format.`;
                case "invalid_dimensions":
                    return `${getEmoji("warn")} Invalid dimensions: \`${ctx.argsText}\`.`;
                default:
                    throw err;
            }
        }

        let roomInfo;

        try {
            roomInfo = CleanroomUtil.calc(dims);
        } catch (err) {
            if (err.name !== "UtilError") {
                throw err;
            }

            if (err.message.includes("at least")) {
                return `${getEmoji("warn")} Cleanroom size must be at least **${CleanroomUtil.minSize.join("x")}**.`;
            } else if (err.message.includes("bigger")) {
                return `${getEmoji("warn")} Cleanroom cannot be bigger than **${CleanroomUtil.maxSize.join("x")}**.`;
            } else {
                return `${getEmoji("warn")} ${err.message}.`;
            }
        }

        const header = `${getEmoji("info")} Resources required for a \`${ctx.argsText}\` cleanroom:`;

        const embed = new EmbedBuilder()
            .addFields(
                {
                    name: "Cleanroom controller:",
                    value: "- " + Util.formatNumber(roomInfo.controller)
                },
                {
                    name: "Plascrete frame:",
                    value: "- " + Util.formatNumber(roomInfo.frame),
                    inline: true
                },
                {
                    name: "Plascrete or glass walls:",
                    value: "- " + Util.formatNumber(roomInfo.walls),
                    inline: true
                },
                {
                    name: "Filter casings:",
                    value: "- " + Util.formatNumber(roomInfo.filters),
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
}

export default CleanroomCalcCommand;
