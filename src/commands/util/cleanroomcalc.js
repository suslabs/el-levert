import discord from "discord.js-selfbot-v13";
const { EmbedBuilder } = discord;

export default {
    name: "cleanroomcalc",
    handler: args => {
        const dims = args.split("x");

        if (dims.length !== 3) {
            return ":warning: Must specify all dimensions in LxWxH format.";
        }

        const l = parseInt(dims[0]),
            w = parseInt(dims[1]),
            h = parseInt(dims[2]);

        if (isNaN(l) || isNaN(w) || isNaN(h)) {
            return `:warning: Invalid dimensions: \`${dims[0]}\`x\`${dims[1]}\`x\`${dims[2]}\`.`;
        }

        if (l < 5 || w < 5 || h < 5) {
            return ":warning: Cleanroom must be at least 5x5x5.";
        }

        if (l > 15 || w > 15 || h > 15) {
            return ":warning: Cleanroom cannot be bigger than 15x15x15.";
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
