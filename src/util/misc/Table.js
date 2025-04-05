import Util from "../Util.js";

import UtilError from "../../errors/UtilError.js";

// prettier-ignore
const charsets = Object.freeze({
    "light": {
        corner: {
            topLeft: "┌",
            topRight: "┐",
            bottomLeft: "└",
            bottomRight: "┘"
        },
        horizontal: {
            line: "─",
            crossDown: "┬",
            crossUp: "┴"
        },
        vertical: {
            line: "│",
            crossRight: "├",
            crossLeft: "┤"
        },
        middle: {
            cross: "┼"
        }
    },

    "heavy": {
        corner: {
            topLeft: "┏",
            topRight: "┓",
            bottomLeft: "┗",
            bottomRight: "┛"
        },
        horizontal: {
            line: "━",
            crossDown: "┳",
            crossUp: "┻"
        },
        vertical: {
            line: "┃",
            crossRight: "┣",
            crossLeft: "┫"
        },
        middle: {
            cross: "╋"
        }
    },

    "doubleHorizontal": {
        corner: {
            topLeft: "╒",
            topRight: "╕",
            bottomLeft: "╘",
            bottomRight: "╛"
        },
        horizontal: {
            line: "═",
            crossDown: "╥",
            crossUp: "╧"
        },
        vertical: {
            line: "│",
            crossRight: "╞",
            crossLeft: "╡"
        },
        middle: {
            cross: "╪"
        }
    },

    "doubleVertical": {
        corner: {
            topLeft: "╓",
            topRight: "╖",
            bottomLeft: "╙",
            bottomRight: "╜"
        },
        horizontal: {
            line: "─",
            crossDown: "╥",
            crossUp: "╨"
        },
        vertical: {
            line: "║",
            crossRight: "╟",
            crossLeft: "╢"
        },
        middle: {
            cross: "╫"
        }
    },

    "double": {
        corner: {
            topLeft: "╔",
            topRight: "╗",
            bottomLeft: "╚",
            bottomRight: "╝"
        },
        horizontal: {
            line: "═",
            crossDown: "╦",
            crossUp: "╩"
        },
        vertical: {
            line: "║",
            crossRight: "╠",
            crossLeft: "╣"
        },
        middle: {
            cross: "╬"
        }
    }
});

const TableUtil = Object.freeze({
    columnWidth: (heading, rows, minWidth = 0, maxWidth = Infinity) => {
        if (rows == null) {
            rows = [];
        }

        const lineMax = Util.maxLength(rows),
            width = Math.max(Util.stringLength(heading), lineMax);

        return Util.clamp(width, minWidth, maxWidth);
    },

    padLine: (line, widths, extraSpaces, centerText) => {
        return line.map((x, i) => {
            const str = x?.toString() ?? "",
                endPad = widths[i] ?? 0;

            if (centerText) {
                const sides = endPad - str.length;

                if (sides <= 0) {
                    return str;
                }

                const left = Math.floor(sides / 2),
                    right = sides - left;

                return " ".repeat(left) + str + " ".repeat(right);
            } else {
                return " ".repeat(extraSpaces) + str.padEnd(endPad);
            }
        });
    }
});

const Lines = Object.freeze({
    line: (horizontalChar, leftChar, rightChar, crossChar) => widths => {
        const segment = widths.map(w => horizontalChar.repeat(w)).join(crossChar);
        return Util.concat(leftChar, segment, rightChar);
    },

    topSeparatorLine: charset =>
        Lines.line(
            charset.horizontal.line,
            charset.corner.topLeft,
            charset.corner.topRight,
            charset.horizontal.crossDown
        ),

    bottomSeparatorLine: charset =>
        Lines.line(
            charset.horizontal.line,
            charset.corner.bottomLeft,
            charset.corner.bottomRight,
            charset.horizontal.crossUp
        ),

    middleSeparatorLine: (charset, sideLines) =>
        Lines.line(
            charset.horizontal.line,
            sideLines ? charset.vertical.crossRight : "",
            sideLines ? charset.vertical.crossLeft : "",
            charset.middle.cross
        ),

    insertSeparator: (charset, sideLines) => line => {
        const separator = charset.vertical.line;

        if (sideLines) {
            return separator + line.join(separator) + separator;
        } else {
            return line.join(separator);
        }
    }
});

class Table {
    static defaultStyle = "light";

    constructor(columns, rows, style, options = {}) {
        this.columns = columns ?? {};
        this.rows = rows ?? {};

        this.rows = rows;

        this.style = style ?? Table.defaultStyle;
        this.options = options;

        this.customChars = options.customCharset;
        this.extraSpaces = options.extraSpaces ?? 0;
        this.centerText = options.center ?? false;
        this.sideLines = options.sideLines ?? true;
    }

    get charset() {
        if (this.style === "custom") {
            if (this.customChars == null) {
                throw new UtilError("No custom charset object provided");
            }

            return this.customChars;
        }

        const charset = charsets[this.style];

        if (typeof charset === "undefined") {
            throw new UtilError("Invalid style: " + this.style);
        }

        return charset;
    }

    get columnIds() {
        const colIds = Object.keys(this.columns);
        return Util.empty(colIds) ? null : colIds;
    }

    get columnNames() {
        const colNames = Object.values(this.columns);
        return Util.empty(colNames) ? null : colNames;
    }

    columnWidths() {
        const colIds = this.columnIds;

        if (colIds === null) {
            return [0];
        }

        let maxWidths = colIds.map(id => {
            const colName = this.columns[id],
                colRows = this.rows[id];

            return TableUtil.columnWidth(colName, colRows);
        });

        if (this.extraSpaces > 0) {
            maxWidths = maxWidths.map(width => width + 2 * this.extraSpaces);
        }

        this.widths = maxWidths;
        return maxWidths;
    }

    maxRowHeight() {
        const colIds = this.columnIds;

        if (colIds === null) {
            return 0;
        }

        const allRows = colIds.map(id => this.rows[id]),
            maxHeight = Util.maxLength(allRows, "array");

        this.height = maxHeight;
        return maxHeight;
    }

    getLines() {
        const height = this.maxRowHeight();

        const colIds = this.columnIds,
            colNames = this.columnNames;

        const lines = Array(height + 1);
        lines[0] = colIds ? colNames : [""];

        for (let i = 0; i < height; i++) {
            const line = [];

            for (const id of colIds) {
                const row = this.rows[id],
                    str = String(row?.[i] ?? "");

                line.push(str);
            }

            lines[i + 1] = line;
        }

        return lines;
    }

    draw() {
        const lines = this._getSeparatedLines();

        const headingLine = Util.first(lines),
            contentLines = Util.after(lines).join("\n");

        const formattedTable = [headingLine];

        const topSeparatorLine = Lines.topSeparatorLine(this.charset),
            middleSeparatorLine = Lines.middleSeparatorLine(this.charset, this.sideLines),
            bottomSeparatorLine = Lines.bottomSeparatorLine(this.charset);

        if (!Util.empty(contentLines)) {
            formattedTable.push(middleSeparatorLine(this.widths));
            formattedTable.push(contentLines);
        }

        if (this.sideLines) {
            formattedTable.unshift(topSeparatorLine(this.widths));
            formattedTable.push(bottomSeparatorLine(this.widths));
        }

        return formattedTable.join("\n");
    }

    _getSeparatedLines() {
        const widths = this.columnWidths();

        const lines = this.getLines(),
            paddedLines = lines.map(line => TableUtil.padLine(line, widths, this.extraSpaces, this.centerText));

        const separate = Lines.insertSeparator(this.charset, this.sideLines),
            separatedLines = paddedLines.map(line => separate(line));

        return separatedLines;
    }
}

function drawTable(columns, rows, style, options) {
    for (const id of Object.keys(rows)) {
        if (!Array.isArray(rows[id])) {
            rows[id] = [rows[id]];
        }
    }

    const table = new Table(columns, rows, style, options);
    return table.draw();
}

export { Table, drawTable };
