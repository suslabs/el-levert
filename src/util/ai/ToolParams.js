import AIUtil from "./AIUtil.js";

const ToolParams = Object.freeze({
    string: (description, extra) => ({ type: "string", description, ...extra }),
    integer: description => ({ type: "integer", description }),
    number: description => ({ type: "number", description }),
    boolean: description => ({ type: "boolean", description }),
    stringArray: (description, extra) => ({ type: "array", items: { type: "string" }, description, ...extra }),

    page: () => {
        const chars = AIUtil.pageChars;

        return {
            offset: ToolParams.integer("Character offset to continue from."),
            maxChars: ToolParams.integer(`Characters to return, ${chars.min}-${chars.max} (default ${chars.default}).`)
        };
    },

    object: (properties, required) => {
        const schema = { type: "object", properties };
        return typeof required === "undefined" ? schema : { ...schema, required };
    }
});

export default ToolParams;
