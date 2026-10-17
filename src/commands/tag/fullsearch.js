import { EmbedBuilder } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import RegexUtil from "../../util/misc/RegexUtil.js";
import PaginationUtil from "../../util/commands/PaginationUtil.js";
import uFuzzySearch from "../../util/search/uFuzzySearch.js";

const unavailable = "No text available";

function getWordIndices(body, ranges) {
    const matches = Array.from(body.matchAll(/\S+/g));

    if (Util.empty(ranges)) {
        return [matches.map(match => Util.first(match)), []];
    }

    const wordInds = new Set();

    for (let i = 0; i < ranges.length; i += 2) {
        const start = ranges[i],
            end = ranges[i + 1];

        matches.forEach((match, j) => {
            const wordStart = match.index,
                wordEnd = wordStart + Util.first(match).length;

            if (start < wordEnd && end > wordStart) {
                wordInds.add(j);
            }
        });
    }

    return [matches.map(match => Util.first(match)), Array.from(wordInds)];
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

function formatSearchResults(command, results, ranges, n, discord, startIndex = 0) {
    const format = results.map((tag, i) => {
        let snippet = "";

        if (Util.empty(tag.body)) {
            snippet = discord ? `*${unavailable}*` : unavailable;
        } else {
            const [words, wordInds] = getWordIndices(tag.body, ranges[i]);
            snippet = formatSnippet(words, wordInds, n, discord);
        }

        const idx = startIndex === 0 && Util.single(results) ? "-" : `${startIndex + i + 1}.`;

        if (discord) {
            const cmd = `${command.prefix}${Util.first(command.parentCmd.aliases)}`;
            return `${idx} ${cmd} **${tag.name}**\n${snippet}`;
        }

        return `${idx} ${tag.name} - ${snippet}`;
    });

    return format.join("\n");
}

const defaultResultLimit = 8,
    defaultContext = 3,
    separators = ",.;-",
    splitRegex = new RegExp(RegexUtil.escapeCharClass(separators), "g");

class TagFullSearchCommand {
    static info = {
        name: "fullsearch",
        aliases: ["query"],
        parent: "tag",
        subcommand: true,
        args: "<query> [limit|all] [--page <num>] [--limit <num>] [--all]",
        description:
            "Search inside the text content and script bodies of all registered tags for matches, displaying contextual snippet previews.",
        usage: "- <query>: Text query to search for within tag contents.\n- [limit|all]: Maximum results to return, or 'all'.",
        parser: {
            requireArgs: true
        },
        arguments: [
            ...PaginationUtil.getPaginationArguments({ defaultLimit: defaultResultLimit, maxLimit: 50 }),
            {
                name: "query",
                kind: "positional",
                index: 0,
                lowercase: true
            },
            {
                name: "resultText",
                kind: "positional",
                index: 1,
                lowercase: true
            },
            {
                name: "queryBody",
                from: "query",
                kind: "rest",
                type: "script"
            }
        ]
    };

    async handler(ctx) {
        const queryArg = ctx.arg("queryBody");
        let query = queryArg != null ? queryArg.body : "";

        const m_text = ctx.arg("resultText"),
            all = m_text === "all";

        const paginationOpts = PaginationUtil.getPaginationOptions(ctx, {
            defaultLimit: defaultResultLimit,
            maxLimit: 50
        });

        let isAll = paginationOpts.all || all,
            customLimit = null;

        if (!Util.empty(m_text) && !isAll) {
            const parsed = Util.parseInt(m_text);

            if (Number.isNaN(parsed) || parsed < 1) {
                return `${getEmoji("warn")} Invalid number: ${m_text}`;
            }

            customLimit = Util.clamp(parsed, 1, 50);
        }

        const limit = customLimit ?? paginationOpts.limit ?? defaultResultLimit;
        query = query.split(splitRegex).join(" ");

        if (isAll) {
            const { results, ranges, other } = await getClient().tagManager.fullSearch(query, Infinity);

            if (Util.empty(results)) {
                return `${getEmoji("info")} Found **no** similar tags.`;
            }

            const plus = other.oversized ? "+" : "",
                totalMatches = other.total ?? results.length,
                s = totalMatches === 1 ? "" : "s",
                count = Util.formatNumber(totalMatches) + plus,
                header = `${getEmoji("info")} Found **${count}** matching tag${s}:`;

            if (results.length > 2 * defaultResultLimit) {
                return {
                    content: `${header}\n`,
                    ...DiscordUtil.getFileAttach(
                        formatSearchResults(this, results, ranges, defaultContext, false, 0),
                        "results.txt"
                    )
                };
            }

            const embed = new EmbedBuilder().setDescription(
                formatSearchResults(this, results, ranges, defaultContext, true, 0)
            );

            return {
                content: header,
                embeds: [embed]
            };
        }

        const sorted = await getClient().tagManager.fullSearchSort(query);

        if (sorted == null || sorted.total === 0) {
            return `${getEmoji("info")} Found **no** similar tags.`;
        }

        const s = sorted.total === 1 ? "" : "s",
            count = Util.formatNumber(sorted.total),
            header = `${getEmoji("info")} Found **${count}** matching tag${s}:`;

        if (sorted.total <= limit) {
            const initialSlice = uFuzzySearch.slice(sorted, 0, sorted.total);

            const embed = new EmbedBuilder().setDescription(
                formatSearchResults(this, initialSlice.results, initialSlice.ranges, defaultContext, true, 0)
            );

            return {
                content: header,
                embeds: [embed]
            };
        }

        const precomputePages = 5;

        const initialPage = paginationOpts.page ?? 1,
            totalPages = Math.max(1, Math.ceil(sorted.total / limit)),
            clampedPage = Util.clamp(initialPage, 1, totalPages);

        const initialStartPage = clampedPage,
            initialEndPage = Math.min(initialStartPage + precomputePages - 1, totalPages),
            initialOffset = (initialStartPage - 1) * limit,
            initialCount = Math.min((initialEndPage - initialStartPage + 1) * limit, sorted.total - initialOffset);

        const initialSlice = uFuzzySearch.slice(sorted, initialOffset, initialCount),
            initialRanges = initialSlice.ranges;

        let currentWindow = {
            startPage: initialStartPage,
            endPage: initialEndPage,
            items: initialSlice.results.map((result, i) => ({ result, range: initialRanges[i] ?? [] }))
        };

        return await PaginationUtil.paginate(ctx, {
            defaultLimit: limit,
            window: currentWindow,
            fetch: ({ page, limit: pageSize }, fetchCtx) => {
                const session = fetchCtx.paginationSession ?? ctx.paginationSession,
                    activeWindow = session != null && session.window != null ? session.window : currentWindow;

                if (page >= activeWindow.startPage && page <= activeWindow.endPage) {
                    const offsetInWindow = (page - activeWindow.startPage) * pageSize;

                    return {
                        items: activeWindow.items.slice(offsetInWindow, offsetInWindow + pageSize),
                        totalCount: sorted.total
                    };
                }

                const newStartPage = page,
                    newEndPage = Math.min(newStartPage + precomputePages - 1, totalPages),
                    fetchOffset = (newStartPage - 1) * pageSize,
                    fetchCount = Math.min((newEndPage - newStartPage + 1) * pageSize, sorted.total - fetchOffset);

                const newSlice = uFuzzySearch.slice(sorted, fetchOffset, fetchCount),
                    newRanges = newSlice.ranges;

                const newWindow = {
                    startPage: newStartPage,
                    endPage: newEndPage,
                    items: newSlice.results.map((result, i) => ({ result, range: newRanges[i] ?? [] }))
                };

                if (session != null) {
                    session.window = newWindow;
                } else {
                    currentWindow = newWindow;
                }

                const offsetInWindow = (page - newWindow.startPage) * pageSize;

                return {
                    items: newWindow.items.slice(offsetInWindow, offsetInWindow + pageSize),
                    totalCount: sorted.total
                };
            },
            render: (pageItems, { page }) => {
                const pageResults = pageItems.map(item => item.result),
                    pageRanges = pageItems.map(item => item.range);

                const startIndex = (page - 1) * ctx.pageSize,
                    desc = formatSearchResults(this, pageResults, pageRanges, defaultContext, true, startIndex);

                return {
                    content: header,
                    embeds: [new EmbedBuilder().setDescription(desc)]
                };
            },
            dumpHeader: header,
            formatDump: (items, discord = true) => {
                const allSlice = uFuzzySearch.slice(sorted, 0, sorted.total);
                return formatSearchResults(this, allSlice.results, allSlice.ranges, defaultContext, discord, 0);
            },
            filename: "results.txt"
        });
    }

    async interactionHandler(ctx) {
        return await PaginationUtil.handleInteraction(ctx);
    }
}

export default TagFullSearchCommand;
