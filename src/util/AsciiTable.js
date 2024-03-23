const charSets = {
    light: {
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
    heavy: {
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
    doubleHorizontal: {
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
    doubleVertical: {
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
    double: {
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
};

const Util = {
    clamp: (x, a, b) => {
        return Math.max(Math.min(x, b), a);
    },
    length: val => {
        if (typeof val === "undefined") {
            return 0;
        }

        return ("" + val).length;
    },
    arrayLength: arr => {
        if (typeof arr === "undefined") {
            return 0;
        }

        return arr.length;
    },
    concat: (a, ...args) => {
        const concatenated = [].concat(a, ...args);

        if (Array.isArray(a)) {
            return concatenated;
        }

        return concatenated.join("");
    },
    columnWidth: (heading, rows, minWidth = 0, maxWidth = Infinity) => {
        if (typeof rows === "undefined") {
            rows = [];
        }

        const lineLengths = rows.map(Util.length),
            lineMax = Math.max(...lineLengths);

        const width = Math.max(Util.length(heading), lineMax);

        return Util.clamp(width, minWidth, maxWidth);
    }
};

const Lines = {
    line: (horizontalChar, leftChar, rightChar, crossChar) => widths => {
        const segment = widths.map(w => horizontalChar.repeat(w)).join(crossChar);

        return Util.concat(leftChar, segment, rightChar);
    },
    topSeparatorLine: charSet =>
        Lines.line(
            charSet.horizontal.line,
            charSet.corner.topLeft,
            charSet.corner.topRight,
            charSet.horizontal.crossDown
        ),
    bottomSeparatorLine: charSet =>
        Lines.line(
            charSet.horizontal.line,
            charSet.corner.bottomLeft,
            charSet.corner.bottomRight,
            charSet.horizontal.crossUp
        ),
    middleSeparatorLine: charSet =>
        Lines.line(
            charSet.horizontal.line,
            charSet.vertical.crossRight,
            charSet.vertical.crossLeft,
            charSet.middle.cross
        ),
    insertSeparator: charSet => line => {
        const separator = charSet.vertical.line;
        return separator + line.join(separator) + separator;
    }
};

function columnWidths(columns, rows) {
    const colIds = Object.keys(columns);

    if (colIds.length === 0) {
        return [0];
    }

    const maxWidths = colIds.map(id => {
        const colName = columns[id],
            colRows = rows[id];

        return Util.columnWidth(colName, colRows);
    });

    return maxWidths;
}

function maxRowHeight(columns, rows) {
    const colIds = Object.keys(columns);

    if (colIds.length === 0) {
        return 0;
    }

    const rowHeights = colIds.map(id => {
        const row = rows[id];
        return Util.arrayLength(row);
    });

    return Math.max(...rowHeights);
}

function padLine(line, padding) {
    const padded = line.map((x, i) => {
        const pad = padding[i] ?? 0,
            str = x ? x.toString() : "";

        return str.padEnd(pad);
    });

    return padded;
}

function getLines(columns, rows) {
    const height = maxRowHeight(columns, rows);

    const colIds = Object.keys(columns),
        colNames = Object.values(columns);

    const lines = Array(height + 1);

    if (colIds.length === 0) {
        lines[0] = [""];
    } else {
        lines[0] = colNames;
    }

    for (let i = 1; i <= height; i++) {
        const line = [];

        for (const id of colIds) {
            const row = rows[id],
                str = row[i - 1] ?? "";

            line.push(str);
        }

        lines[i] = line;
    }

    return lines;
}

function table(columns, rows, style = "light", extraSpacing = 0) {
    columns = columns ?? {};
    rows = rows ?? {};

    for (const id in rows) {
        const row = rows[id];

        if (!Array.isArray(row)) {
            rows[id] = [row];
        }
    }

    const charSet = charSets[style],
        widths = columnWidths(columns, rows);

    if (extraSpacing > 0) {
        for (let i = 0; i < widths.length; i++) {
            widths[i] += extraSpacing;
        }
    }

    const separate = Lines.insertSeparator(charSet),
        topSeparatorLine = Lines.topSeparatorLine(charSet),
        bottomSeparatorLine = Lines.bottomSeparatorLine(charSet),
        middleSeparatorLine = Lines.middleSeparatorLine(charSet);

    const lines = getLines(columns, rows),
        paddedLines = lines.map(line => padLine(line, widths)),
        separatedLines = paddedLines.map(separate);

    const headingLine = separatedLines[0],
        contentLines = separatedLines.slice(1).join("\n");

    const formattedTable = [topSeparatorLine(widths), headingLine];

    if (contentLines.length > 0) {
        formattedTable.push(middleSeparatorLine(widths));
        formattedTable.push(contentLines);
    }

    formattedTable.push(bottomSeparatorLine(widths));

    return formattedTable.join("\n");
}

export default table;
