import ToolParams from "./ToolParams.js";

import Util from "../../util/Util.js";

class TextPager {
    static defaultChars = 5000;
    static minChars = 500;
    static maxChars = 8000;

    static params = {
        offset: ToolParams.integer("Character offset to continue from."),
        maxChars: ToolParams.integer(
            `Characters to return, ${TextPager.minChars}-${TextPager.maxChars} (default ${TextPager.defaultChars}).`
        )
    };

    static page(text, args) {
        const offset = Math.max(args.offset ?? 0, 0),
            maxChars = Util.clamp(args.maxChars ?? TextPager.defaultChars, TextPager.minChars, TextPager.maxChars);

        const end = offset + maxChars;

        return {
            text: text.slice(offset, end),
            offset,
            nextOffset: end < text.length ? end : null,
            totalChars: text.length
        };
    }
}

export default TextPager;
