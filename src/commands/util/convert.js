import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";
import ConversionUtil from "../../util/commands/ConversionUtil.js";

function codeblock(str) {
    return `\`\`\`lua\n${str}\`\`\``;
}

export default {
    name: "convert",
    aliases: ["c"],
    category: "util",

    handler: function (args) {
        const [inStr, unitStr] = ParserUtil.splitArgs(args),
            units = unitStr.split(" ").filter(unit => !Util.empty(unit));

        if (Util.empty(inStr) || Util.empty(units)) {
            return `:information_source: ${this.getArgsHelp("input from_unit to_unit ...")}`;
        }

        const inVal = Number.parseFloat(inStr),
            [inUnit, ...outUnits] = units;

        if (Number.isNaN(inVal)) {
            return `:warning: Invalid input value: \`${inStr}\`.`;
        }

        let out;

        try {
            out = ConversionUtil.convert(inVal, inUnit, outUnits);
        } catch (err) {
            if (err.name !== "UtilError") {
                throw err;
            }

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

            const validUnits = `Valid units are: **${ConversionUtil.validUnits.join("**, **")}**`;
            return `:warning: ${errOut}\n${validUnits}`;
        }

        return codeblock(out.join(" = "));
    }
};
