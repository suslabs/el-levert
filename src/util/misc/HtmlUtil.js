import Util from "../Util.js";

const HtmlUtil = Object.freeze({
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
        return String(str).replace(HtmlUtil._entityRegex, (match, code) => {
            if (!code.startsWith("#")) {
                return HtmlUtil.entities[code.toLowerCase()] ?? match;
            }

            const isHex = code[1].toLowerCase() === "x",
                num = isHex ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);

            return Number.isFinite(num) ? String.fromCodePoint(num) : match;
        });
    },

    _tagRegex: /<[^>]+>/g,
    stripTags: html => {
        return HtmlUtil.decodeEntities(String(html).replace(HtmlUtil._tagRegex, "")).trim();
    },

    _titleRegex: /<title[^>]*>([\s\S]*?)<\/title>/i,
    _hiddenRegex: /<(script|style|noscript|svg|head|title|template|iframe)[\s\S]*?<\/\1>/gi,
    _commentRegex: /<!--[\s\S]*?-->/g,
    _mainRegex: /<(main|article)[\s\S]*?<\/\1>/i,
    _blockEndRegex: /<(br|\/p|\/div|\/h[1-6]|\/li|\/tr|\/section)[^>]*>/gi,
    _listItemRegex: /<li[^>]*>/gi,
    _spaceRegex: /[ \t\f\v ]+/g,
    _newlineRegex: / *\n[ \n]*/g,
    minMainLength: 1500,

    toText: html => {
        html = String(html);

        const titleMatch = html.match(HtmlUtil._titleRegex),
            title = titleMatch === null ? "" : HtmlUtil.stripTags(titleMatch[1]);

        let body = html.replace(HtmlUtil._hiddenRegex, " ").replace(HtmlUtil._commentRegex, " ");

        const main = body.match(HtmlUtil._mainRegex);

        if (main !== null && Util.first(main).length > HtmlUtil.minMainLength) {
            body = Util.first(main);
        }

        const text = HtmlUtil.decodeEntities(
            body
                .replace(HtmlUtil._blockEndRegex, "\n")
                .replace(HtmlUtil._listItemRegex, "• ")
                .replace(HtmlUtil._tagRegex, " ")
        )
            .replace(HtmlUtil._spaceRegex, " ")
            .replace(HtmlUtil._newlineRegex, "\n")
            .trim();

        return { title, text };
    }
});

export default HtmlUtil;
