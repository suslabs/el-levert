import Util from "../Util.js";
import ArrayUtil from "../ArrayUtil.js";

const HTMLUtil = Object.freeze({
    entities: Object.freeze({
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
        nbsp: " ",
        mdash: "—",
        ndash: "–",
        hellip: "…"
    }),

    _entityRegex: /&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi,
    decodeEntities: str => {
        return String(str).replace(HTMLUtil._entityRegex, (match, code) => {
            if (!code.startsWith("#")) {
                return HTMLUtil.entities[code.toLowerCase()] ?? match;
            }

            const isHex = code[1].toLowerCase() === "x",
                num = isHex ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);

            return Number.isFinite(num) ? String.fromCodePoint(num) : match;
        });
    },

    _tagRegex: /<[^>]+>/g,
    stripTags: html => {
        return HTMLUtil.decodeEntities(String(html).replace(HTMLUtil._tagRegex, "")).trim();
    },

    _titleRegex: /<title[^>]*>([\s\S]*?)<\/title>/i,
    _hiddenRegex: /<(script|style|noscript|svg|head|title|template|iframe)[\s\S]*?<\/\1>/gi,
    _commentRegex: /<!--[\s\S]*?-->/g,
    _mainRegex: /<(main|article)[\s\S]*?<\/\1>/i,
    _blockEndRegex: /<(br|\/p|\/div|\/h[1-6]|\/li|\/tr|\/section)[^>]*>/gi,
    _listItemRegex: /<li[^>]*>/gi,
    _spaceRegex: /[ \t\f\v\u00a0]+/g,
    _newlineRegex: / *\n[ \n]*/g,
    minMainLength: 1500,
    maxExtractedImages: 8,

    _metaImageRegex:
        /<meta\b(?=[^>]*?(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'])[^>]*?content=["']([^"']+)["'][^>]*>/gi,
    _imgTagRegex: /<img\b[^>]*?>/gi,
    _imgSrcRegex: /\b(?:src|data-src)=["']([^"']+)["']/i,
    _tinyDimensionRegex: /\b(?:width|height)=["']?1(?:px)?["']?(?:\s|>|\/)/i,
    _svgUrlRegex: /\.svg(?:[?#]|$)/i,

    extractImages: (html, baseUrl, limit = HTMLUtil.maxExtractedImages) => {
        if (!Util.nonemptyString(html)) {
            return [];
        }

        const candidates = [];

        HTMLUtil._metaImageRegex.lastIndex = 0;

        for (const match of html.matchAll(HTMLUtil._metaImageRegex)) {
            candidates.push(match[1]);
        }

        const cleanBody = html.replace(HTMLUtil._hiddenRegex, " ").replace(HTMLUtil._commentRegex, " ");

        HTMLUtil._imgTagRegex.lastIndex = 0;

        for (const match of cleanBody.matchAll(HTMLUtil._imgTagRegex)) {
            const tag = match[0];

            if (HTMLUtil._tinyDimensionRegex.test(tag)) {
                continue;
            }

            const srcMatch = tag.match(HTMLUtil._imgSrcRegex);

            if (srcMatch !== null) {
                candidates.push(srcMatch[1]);
            }
        }

        const urls = [];

        for (const raw of candidates) {
            const decoded = HTMLUtil.decodeEntities(raw).trim();

            if (Util.empty(decoded) || decoded.startsWith("data:") || decoded.startsWith("javascript:")) {
                continue;
            }

            let resolved;

            try {
                resolved = new URL(decoded, baseUrl);
            } catch {
                continue;
            }

            if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
                continue;
            }

            const href = resolved.toString();

            if (!HTMLUtil._svgUrlRegex.test(href)) {
                urls.push(href);
            }
        }

        return ArrayUtil.unique(urls).slice(0, limit);
    },

    toText: html => {
        html = String(html);

        const titleMatch = html.match(HTMLUtil._titleRegex),
            title = titleMatch === null ? "" : HTMLUtil.stripTags(titleMatch[1]);

        let body = html.replace(HTMLUtil._hiddenRegex, " ").replace(HTMLUtil._commentRegex, " ");

        const main = body.match(HTMLUtil._mainRegex);

        if (main !== null && Util.first(main).length > HTMLUtil.minMainLength) {
            body = Util.first(main);
        }

        const text = HTMLUtil.decodeEntities(
            body
                .replace(HTMLUtil._blockEndRegex, "\n")
                .replace(HTMLUtil._listItemRegex, "• ")
                .replace(HTMLUtil._tagRegex, " ")
        )
            .replace(HTMLUtil._spaceRegex, " ")
            .replace(HTMLUtil._newlineRegex, "\n")
            .trim();

        return { title, text };
    }
});

export default HTMLUtil;
