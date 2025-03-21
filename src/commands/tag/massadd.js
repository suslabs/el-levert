import fs from "node:fs";
import path from "node:path";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

export default {
    name: "massadd",
    parent: "tag",
    subcommand: true,
    ownerOnly: true,

    handler: async function (args) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("tag_prefix owner input_dir")}`;
        }

        let [tagPrefix, split1] = Util.splitArgs(args),
            [owner, inputDir] = Util.splitArgs(split1);

        inputDir = path.resolve(projRoot, inputDir);
        const files = fs.readdirSync(inputDir);

        files.sort((a, b) =>
            a.localeCompare(b, "en", {
                numeric: true
            })
        );

        const out = [];

        for (let i = 0; i < files.length; i++) {
            const filePath = path.join(inputDir, files[i]),
                contents = fs.readFileSync(filePath, "utf-8");

            const tagName = tagPrefix + (i + 1).toString();

            await getClient().tagManager.add(tagName, contents, owner);
            out.push(`Added file ${files[i]} as tag: ${tagName}`);
        }

        return out.join("\n");
    }
};
