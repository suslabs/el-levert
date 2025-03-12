import { EmbedBuilder } from "discord.js";

import GregicUtil from "../../util/oc/GregicUtil.js";

export default {
    name: "oc",
    category: "util",

    handler: args => {
        if (Util.empty(args)) {
            return ":information_source: %oc (-version) [EU/t] [duration]";
        }

        const split = args.split(" ");
        let type = "ceu",
            eu,
            dur;

        switch (split.length) {
            case 2:
                eu = parseInt(split[0], 10);
                dur = parseInt(split[1], 10);
                break;
            case 3:
                type = split[0].substring(1);

                if (!split[0].includes("-") || !Object.keys(GregicUtil.allTiers).includes(type)) {
                    return `:warning: Invalid version: \`${type}\``;
                }

                eu = parseInt(split[1], 10);
                dur = parseInt(split[2], 10);
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

        const oc = GregicUtil.oc(eu, dur, type),
            embed = new EmbedBuilder().setTitle(`${eu} EU/t for ${dur}s`).addFields([
                {
                    name: "EU/t",
                    value: `\`\`\`lua\n${oc.map(x => x.eu.toLocaleString() + " EU/t").join("\n")}\`\`\``,
                    inline: true
                },
                {
                    name: "Time",
                    value: `\`\`\`lua\n${oc
                        .map(x => {
                            if (x.t_dur < 10) {
                                return x.t_dur.toLocaleString() + "t";
                            } else {
                                return x.dur.toLocaleString() + "s";
                            }
                        })
                        .join("\n")}\`\`\``,
                    inline: true
                },
                {
                    name: "Voltage",
                    value: `\`\`\`\n${oc.map(x => x.tier).join("\n")}\`\`\``,
                    inline: true
                }
            ]);

        if (type === "nomi") {
            embed.setFooter({
                text: "MAX is only available in dev, and only for multiblocks."
            });
        }

        return {
            embeds: [embed]
        };
    }
};
