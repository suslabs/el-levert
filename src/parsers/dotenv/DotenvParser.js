import ObjectUtil from "../../util/ObjectUtil.js";

const lineRegex =
    /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;

const DotenvParser = Object.freeze({
    parse: src => {
        const out = {};

        let lines = String(src ?? "");
        lines = lines.replace(/\r\n?/gm, "\n");

        lineRegex.lastIndex = 0;
        let match = null;

        while ((match = lineRegex.exec(lines)) !== null) {
            const key = match[1];

            let value = (match[2] ?? "").trim();

            const first = value[0];
            value = value.replace(/^(['"`])([\s\S]*)\1$/gm, "$2");

            if (first === '"') {
                value = value.replace(/\\n/g, "\n");
                value = value.replace(/\\r/g, "\r");
            }

            out[key] = value;
        }

        return out;
    },

    populate: (env, parsed, options) => {
        options = ObjectUtil.guaranteeObject(options);

        const override = options.override ?? false,
            out = ObjectUtil.guaranteeObject(env),
            values = ObjectUtil.guaranteeObject(parsed);

        for (const key of Object.keys(values)) {
            if (Object.hasOwn(out, key) && !override) {
                continue;
            }

            out[key] = values[key];
        }

        return out;
    }
});

export default DotenvParser;
