import { EmbedBuilder } from "discord.js";

const minSize = 5,
    maxSize = 15;

export default {
    name: "cleanroomcalc",
    category: "util",

    handler: args => {
        const dims = args.split("x");

        if (dims.length !== 3) {
            return ":warning: Must specify all dimensions in LxWxH format.";
        }

        const l = parseInt(dims[0], 10),
            w = parseInt(dims[1], 10),
            h = parseInt(dims[2], 10);

        if (isNaN(l) || isNaN(w) || isNaN(h)) {
            return `:warning: Invalid dimensions: \`${dims[0]}\`x\`${dims[1]}\`x\`${dims[2]}\`.`;
        }

        if (l < minSize || w < minSize || h < minSize) {
            return `:warning: Cleanroom must be at least ${minSize}x${minSize}x${minSize}.`;
        }

        if (l > maxSize || w > maxSize || h > maxSize) {
            return `:warning: Cleanroom cannot be bigger than ${maxSize}x${maxSize}x${maxSize}.`;
        }

        const lInner = l - 2,
            wInner = w - 2,
            hInner = h - 2;

        const roof = lInner * wInner,
            lWall = lInner * hInner,
            wWall = wInner * hInner;

        const shell = l * w * h - roof * hInner,
            frame = shell - roof * 2 - lWall * 2 - wWall * 2,
            walls = shell - frame,
            filters = roof - 1;

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
