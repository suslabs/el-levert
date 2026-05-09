import { getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ConversionUtil from "../../util/commands/ConversionUtil.js";

function codeblock(str) {
    return `\`\`\`lua\n${str}\`\`\``;
}

class ConvertCommand {
    static info = {
        name: "convert",
        aliases: ["c"],
        category: "util",
        arguments: [
            {
                name: "inputText",
                parser: "split",
                index: 0
            },
            {
                name: "unitText",
                parser: "split",
                index: 1
            },
            {
                name: "units",
                from: "unitText",
                parser: "words"
            }
        ]
    };

    handler(ctx) {
        const inText = ctx.arg("inputText"),
            units = ctx.arg("units");

        if (Util.empty(inText) || Util.empty(units)) {
            return `${getEmoji("info")} ${this.getArgsHelp("input from_unit to_unit ...")}`;
        }

        const inVal = Number.parseFloat(inText),
            [inUnit, ...outUnits] = units;

        if (Number.isNaN(inVal)) {
            return `${getEmoji("warn")} Invalid input value: \`${inText}\`.`;
        }

        let out;

        try {
            out = ConversionUtil.convert(inVal, inUnit, outUnits);
        } catch (err) {
            if (err.name !== "UtilError") {
                throw err;
            }

            const validUnits = `Valid units are: **${ConversionUtil.validUnits.join("**, **")}**`;
            let errOut;

            switch (err.message) {
                case "No output units provided":
                    errOut = "**No** output units provided.";
                    break;
                case "Invalid input unit":
                    errOut = `Invalid **input** unit: \`${inUnit}\`.`;
                    break;
                case "Invalid output units":
                    errOut = Util.single(err.ref)
                        ? `Invalid **output** unit: \`${err.ref[0]}\`.`
                        : "Invalid **output** units provided.";
                    break;
                default:
                    errOut = `${err.message}.\n${validUnits}`;
                    break;
            }

            return `${getEmoji("warn")} ${errOut}\n${validUnits}`;
        }

        return codeblock(out.join(" = "));
    }
}

export default ConvertCommand;
