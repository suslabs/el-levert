import { getClient } from "../../../LevertClient.js";

import Util from "../../Util.js";
import TypeTester from "../../TypeTester.js";
import DiscordUtil from "../../DiscordUtil.js";

function echo(input, args) {
    if (typeof args === "string" && !Util.empty(args)) {
        if (args.includes("$") && input != null && !Util.empty(String(input))) {
            return args.replaceAll("$", String(input)).trim();
        }

        return args;
    }

    if (input != null && !Util.empty(String(input))) {
        return String(input);
    }

    return String(args ?? "");
}

function extractEmbeds(target) {
    if (Array.isArray(target)) {
        return target;
    }

    if (TypeTester.isObject(target)) {
        if (Array.isArray(target.embeds) && !Util.empty(target.embeds)) {
            return target.embeds;
        }

        return [target];
    }

    return [];
}

function stringifyEmbeds(embeds, options) {
    if (!Array.isArray(embeds) || Util.empty(embeds)) {
        return "";
    }

    return embeds
        .map(embed => DiscordUtil.stringifyEmbed(embed, options))
        .filter(str => !Util.empty(str))
        .join("\n\n");
}

function getEmbedsFromMessage(msg) {
    if (msg == null || !Array.isArray(msg.embeds)) {
        return [];
    }

    return msg.embeds;
}

async function resolveReferencedMessage(msg) {
    const refId = msg?.reference?.messageId;

    if (!Util.nonemptyString(refId)) {
        return null;
    }

    const cached = msg.channel?.messages?.cache?.get(refId);

    if (typeof cached !== "undefined") {
        return cached;
    }

    const client = getClient();

    if (client === null || typeof client.fetchMessage !== "function") {
        return null;
    }

    const channelId = msg.channel?.id ?? msg.channelId;

    if (!Util.nonemptyString(channelId)) {
        return null;
    }

    try {
        return await client.fetchMessage(channelId, refId);
    } catch {
        return null;
    }
}

async function resolveMessageFromUrl(text) {
    if (!Util.nonemptyString(text)) {
        return null;
    }

    const urls = DiscordUtil.findMessageUrls(text);

    if (Util.empty(urls)) {
        return null;
    }

    const client = getClient();

    if (client === null || typeof client.fetchMessage !== "function") {
        return null;
    }

    const url = Util.first(urls);

    if (!Util.nonemptyString(url.ch_id) || !Util.nonemptyString(url.msg_id)) {
        return null;
    }

    try {
        return await client.fetchMessage(url.ch_id, url.msg_id);
    } catch {
        return null;
    }
}

async function unembed(input, args, msg, options) {
    const embedOptions = options?.embedOptions ?? options?.options?.embedOptions;

    let target = input;

    if (typeof input === "string") {
        try {
            target = JSON.parse(input);
        } catch {
            target = input;
        }
    }

    let embeds = extractEmbeds(target);

    if (!Util.empty(embeds)) {
        const result = stringifyEmbeds(embeds, embedOptions);

        if (!Util.empty(result)) {
            return result;
        }
    }

    const urlText = Util.nonemptyString(args) ? args : typeof input === "string" ? input : "",
        urlMsg = await resolveMessageFromUrl(urlText);

    if (urlMsg !== null) {
        embeds = getEmbedsFromMessage(urlMsg);

        if (!Util.empty(embeds)) {
            const result = stringifyEmbeds(embeds, embedOptions);

            if (!Util.empty(result)) {
                return result;
            }
        }
    }

    if (msg != null) {
        embeds = getEmbedsFromMessage(msg);

        if (Util.empty(embeds)) {
            const refMsg = await resolveReferencedMessage(msg);

            if (refMsg !== null) {
                embeds = getEmbedsFromMessage(refMsg);
            }
        }

        if (!Util.empty(embeds)) {
            const result = stringifyEmbeds(embeds, embedOptions);

            if (!Util.empty(result)) {
                return result;
            }
        }
    }

    return String(input ?? "");
}

function unescape(input) {
    return String(input ?? "").replace(/\\([\s\S])/g, "$1");
}

function trim(input) {
    return String(input ?? "").trim();
}

function lower(input) {
    return String(input ?? "").toLowerCase();
}

function upper(input) {
    return String(input ?? "").toUpperCase();
}

function parseLineCount(args, defaultCount = 10) {
    if (Util.empty(args)) {
        return defaultCount;
    }

    const match = String(args).match(/(?:-n\s+)?(\d+)/i);

    if (match === null) {
        return defaultCount;
    }

    const parsed = parseInt(match[1], 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultCount;
}

function head(input, args) {
    const lines = String(input ?? "").split(/\r?\n/),
        n = parseLineCount(args, 10);

    return lines.slice(0, n).join("\n");
}

function tail(input, args) {
    const lines = String(input ?? "").split(/\r?\n/),
        n = parseLineCount(args, 10);

    return lines.slice(-n).join("\n");
}

const StreamOperators = Object.freeze([
    {
        name: "echo",
        execute: echo
    },
    {
        name: "unembed",
        execute: unembed
    },
    {
        name: "unescape",
        execute: unescape
    },
    {
        name: "trim",
        execute: trim
    },
    {
        name: "lower",
        execute: lower
    },
    {
        name: "upper",
        execute: upper
    },
    {
        name: "head",
        execute: head
    },
    {
        name: "tail",
        execute: tail
    }
]);

export default StreamOperators;
