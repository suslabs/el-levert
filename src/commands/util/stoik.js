import { EmbedBuilder } from "discord.js";

import Stoik from "../../parsers/stoik/Stoik.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

import { drawTable } from "../../util/misc/Table.js";

function evaluate(input, side) {
    try {
        const molec = Stoik.evaluate(input);
        return [molec, null];
    } catch (err) {
        if (err.name !== "StoikError") {
            throw err;
        }

        const out = `:warning: Malformed **${side}-hand side** expression. ${formatError(err)}`;

        return [null, out];
    }
}

function formatError(err) {
    if (typeof err.ref === "undefined") {
        return err.message + ".";
    }

    const { ind, type, token, after, for: _for } = err.ref,
        [word] = ParserUtil.splitArgs(err.message);

    let out = `${word} **${type}**`;

    if (typeof _for !== "undefined") {
        out += ` for ${_for}`;
    }

    if (typeof token !== "undefined") {
        out += `: \`${token}\``;
    }

    if (typeof after !== "undefined") {
        out += ` after: **${after}**`;
    }

    if (typeof ind !== "undefined") {
        out += ` at index: **${ind}**`;
    }

    if (TypeTester.charType(Util.last(out)) !== "other") {
        out += ".";
    }

    return out;
}

function formatElement(element, count, maxLength) {
    const elemPad = " ".repeat(2 - element.length),
        countPad = " ".repeat(maxLength - count.length);

    return `${element}:${elemPad} ${countPad}${count}`;
}

function codeblock(str) {
    return `\`\`\`lua\n${str}\`\`\``;
}

export default {
    name: "stoik",
    category: "util",

    handler: args => {
        const [left, right] = ParserUtil.splitArgs(args, false, {
            sep: ["=", "->"]
        });

        if (Util.empty(left) || Util.empty(right)) {
            return `:warning: No expression provided. Please format the equation like:
\`Reactant1 + Reactant2 -> Product1 + Product2\`

Example: \`3CuSO4 + 2Al(NO3)3 -> 3Cu(NO3)2 + Al2(SO4)3\``;
        }

        let leftMolec, rightMolec, err;
        [leftMolec, err] = evaluate(left, "left");

        if (err !== null) {
            return err;
        }

        [rightMolec, err] = evaluate(right, "right");

        if (err !== null) {
            return err;
        }

        const equation = Stoik.formatEquation(leftMolec, rightMolec),
            [balanced, res] = Stoik.checkBalance(equation);

        let header;

        if (balanced) {
            header = ":white_check_mark: Your reaction __is balanced__.";
        } else {
            header = ":x: Your reaction __is not balanced__.";
        }

        for (const val of res) {
            for (const [key, value] of Object.entries(val)) {
                if (typeof value === "number") {
                    val[key] = Util.formatNumber(value);
                }
            }
        }

        const maxLeft = ArrayUtil.maxLength(res.map(val => val.reactantCount)),
            maxRight = ArrayUtil.maxLength(res.map(val => val.productCount));

        const columns = {
            left: "Reactants",
            right: "Products",
            res: "Balanced"
        };

        const rows = {
            left: res.map(val => formatElement(val.element, val.reactantCount, maxLeft)),
            right: res.map(val => formatElement(val.element, val.productCount, maxRight)),
            res: res.map(val => (val.balanced ? "✓" : "✗"))
        };

        const table = drawTable(columns, rows, "light", {
            sideLines: false,
            center: true
        });

        const embed = new EmbedBuilder().setDescription(codeblock(table));

        return {
            content: header,
            embeds: [embed]
        };
    }
};
