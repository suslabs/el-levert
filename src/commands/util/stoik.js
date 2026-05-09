import { EmbedBuilder } from "discord.js";

import { getEmoji } from "../../LevertClient.js";

import Stoik from "../../parsers/stoik/Stoik.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

import { drawTable } from "../../util/misc/Table.js";

function evaluate(ctx, side) {
    try {
        const molec = Stoik.evaluate(ctx);
        return [molec, null];
    } catch (err) {
        if (err.name !== "StoikError") {
            throw err;
        }

        const out = `${getEmoji("warn")} Malformed **${side}-hand side** expression. ${formatError(err)}`;

        return [null, out];
    }
}

function formatError(err) {
    if (typeof err.ref === "undefined") {
        return err.message + ".";
    }

    const { idx, type, token, after, for: _for } = err.ref,
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

    if (typeof idx !== "undefined") {
        out += ` at index: **${idx}**`;
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

class StoikCommand {
    static info = {
        name: "stoik",
        category: "util",
        arguments: [
            {
                name: "left",
                parser: "split",
                options: {
                    sep: ["=", "->"]
                },
                index: 0
            },
            {
                name: "right",
                parser: "split",
                options: {
                    sep: ["=", "->"]
                },
                index: 1
            }
        ]
    };

    handler(ctx) {
        const left = ctx.arg("left"),
            right = ctx.arg("right");

        if (Util.empty(left) || Util.empty(right)) {
            return `${getEmoji("warn")} No expression provided. Please format the equation like:
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
            [balanced, infoRows] = Stoik.checkBalance(equation);

        const header = `${getEmoji(balanced ? "ok" : "error")} Your reaction __is ${balanced ? "" : "not "}balanced__.`;

        for (const val of infoRows) {
            for (const [key, value] of Object.entries(val)) {
                if (typeof value === "number") {
                    val[key] = Util.formatNumber(value);
                }
            }
        }

        const maxLeft = ArrayUtil.maxLength(infoRows.map(val => val.reactantCount)),
            maxRight = ArrayUtil.maxLength(infoRows.map(val => val.productCount));

        const columns = {
                left: "Reactants",
                right: "Products",
                res: "Balanced"
            },
            rows = {
                left: infoRows.map(val => formatElement(val.element, val.reactantCount, maxLeft)),
                right: infoRows.map(val => formatElement(val.element, val.productCount, maxRight)),
                res: infoRows.map(val => (val.balanced ? "✓" : "✗"))
            };

        const table = drawTable(columns, rows, "light", {
                sideLines: false,
                center: true
            }),
            embed = new EmbedBuilder().setDescription(codeblock(table));

        return {
            content: header,
            embeds: [embed]
        };
    }
}

export default StoikCommand;
