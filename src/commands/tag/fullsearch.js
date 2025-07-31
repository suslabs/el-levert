import { EmbedBuilder } from "discord.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";
import RegexUtil from "../../util/misc/RegexUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";

const unavailable = "No text available";

function getWordIndices(body, ranges) {
    const matches = [...body.matchAll(/\S+/g)],
        wordInds = new Set();

    for (let i = 0; i < ranges.length; i += 2) {
        const start = ranges[i],
            end = ranges[i + 1];

        matches.forEach((match, j) => {
            const wordStart = match.index,
                wordEnd = wordStart + match[0].length;

            if (start < wordEnd && end > wordStart) {
                wordInds.add(j);
                return;
            }
        });
    }

    const words = matches.map(match => match[0]);
    return [words, Array.from(wordInds)];
}

function getMergedWindows(count, inds, n) {
    const windows = inds.map(i => [Util.clamp(i - n, 0), Util.clamp(i + n + 1, null, count)]),
        merged = [];

    windows.sort((a, b) => a[0] - b[0]);

    for (const window of windows) {
        const [start, end] = window,
            last = Util.last(merged);

        if (Util.empty(merged) || start > last[1]) {
            merged.push(window);
        } else {
            last[1] = Math.max(last[1], end);
        }
    }

    return merged;
}

function formatSnippet(words, inds, n, discord) {
    const windows = getMergedWindows(words.length, inds, n);

    let snippet = "";

    for (let k = 0; k < windows.length; k++) {
        let [start, end] = windows[k],
            segment = words.slice(start, end);

        if ((k === 0 && start > 0) || k > 0) {
            snippet += " ... ";
        }

        if (discord) {
            segment = segment.map((word, i) => {
                const j = start + i;
                return inds.includes(j) ? `**${word}**` : word;
            });
        }

        snippet += segment.join(" ");

        if (k === windows.length - 1 && end < words.length) {
            snippet += " ... ";
        }
    }

    snippet = snippet.trim();
    return discord ? `> *${snippet}*` : snippet;
}

function formatSearchResults(results, ranges, n, discord) {
    const format = results.map((tag, i) => {
        const idx = Util.single(results) ? "-" : (i + 1).toString() + ".";

        let snippet;

        if (Util.empty(tag.body)) {
            snippet = discord ? `*${unavailable}*` : unavailable;
        } else {
            const [words, wordInds] = getWordIndices(tag.body, ranges[i]);
            snippet = formatSnippet(words, wordInds, n, discord);
        }

        if (discord) {
            const cmd = `${this.prefix}${this.parentCmd.aliases[0]}`;
            return `${idx} ${cmd} **${tag.name}**\n${snippet}`;
        } else {
            return `${idx} ${tag.name} - ${snippet}`;
        }
    });

    return format.join("\n");
}

const defaultResultLimit = 8,
    defaultContext = 3;

const separators = ",.;-",
    splitRegex = new RegExp(RegexUtil.escapeCharClass(separators), "g");

export default {
    name: "fullsearch",
    aliases: ["query"],
    parent: "tag",
    subcommand: true,

    handler: async function (args) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("query [all/max_results]")}`;
        }

        let [query, m_str] = ParserUtil.splitArgs(args, [true, true]),
            all = m_str === "all";

        let maxResults;

        if (all) {
            maxResults = Infinity;
        } else if (!Util.empty(m_str)) {
            maxResults = Util.parseInt(m_str);

            if (Number.isNaN(maxResults) || maxResults < 1) {
                return ":warning: Invalid number: " + m_str;
            }
        } else {
            maxResults = defaultResultLimit;
        }

        ({ body: query } = ParserUtil.parseScript(query));
        query = query.split(splitRegex).join(" ");

        const {
            results,
            ranges,
            other: { oversized }
        } = await getClient().tagManager.fullSearch(query, maxResults);

        if (Util.empty(results)) {
            return ":information_source: Found **no** similar tags.";
        }

        const plus = oversized ? "+" : "",
            s = Util.single(results) ? "" : "s";

        const count = Util.formatNumber(results.length) + plus,
            header = `:information_source: Found **${count}** matching tag${s}:`;

        if (results.length > 2 * defaultResultLimit) {
            const format = formatSearchResults(results, ranges, defaultContext, false);

            return {
                content: header + "\n",
                ...DiscordUtil.getFileAttach(format, "results.txt")
            };
        } else {
            const format = formatSearchResults.call(this, results, ranges, defaultContext, true),
                embed = new EmbedBuilder().setDescription(format);

            return {
                content: header,
                embeds: [embed]
            };
        }
    }
};
