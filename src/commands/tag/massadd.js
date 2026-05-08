import fs from "node:fs/promises";
import path from "node:path";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

export default {
    name: "massadd",
    parent: "tag",
    subcommand: true,
    ownerOnly: true,

    handler: async function (args) {
        if (Util.empty(args)) {
            return `:information_source: ${this.getArgsHelp("tag_prefix owner input_dir")}`;
        }

        let [tagPrefix, split1] = ParserUtil.splitArgs(args),
            [owner, inputDir] = ParserUtil.splitArgs(split1);

        {
            let err;
            [tagPrefix, err] = getClient().tagManager.checkNew(tagPrefix, false);

            if (err !== null) {
                return `:warning: ${err}.`;
            }
        }

        inputDir = path.resolve(projRoot, inputDir);

        let files = await fs.readdir(inputDir, { withFileTypes: true });
        files = files.filter(item => item.isFile());
        files.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));

        const out = [];

        for (const [i, file] of files.entries()) {
            try {
                const filePath = path.join(inputDir, file.name);

                const tagName = `${tagPrefix}${i + 1}`,
                    contents = await fs.readFile(filePath, "utf8");

                getClient().tagManager.checkBody(contents);
                await getClient().tagManager.add(tagName, contents, owner, {
                    checkNew: false
                });

                out.push(`Added file: ${file.name} as tag: ${tagName}`);
            } catch (err) {
                getLogger().error(`Error occured while adding file ${files[i]?.name ?? file?.name}`);
                out.push(`Failed adding file: ${files[i]?.name ?? file?.name} error: ${err.message}`);
            }
        }

        return out.join("\n");
    }
};
