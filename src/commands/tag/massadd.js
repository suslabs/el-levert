import fs from "node:fs/promises";
import path from "node:path";

import { getClient, getEmoji, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class TagMassAddCommand {
    static info = {
        name: "massadd",
        parent: "tag",
        subcommand: true,
        ownerOnly: true,
        arguments: [
            {
                name: "tagPrefix",
                parser: "split",
                index: 0
            },
            {
                name: "rest",
                parser: "split",
                index: 1
            },
            {
                name: "owner",
                from: "rest",
                parser: "split",
                index: 0
            },
            {
                name: "inputDir",
                from: "rest",
                parser: "split",
                index: 1
            }
        ]
    };

    async handler(ctx) {

        if (Util.empty(ctx.argsText)) {
            return `${getEmoji("info")} ${this.getArgsHelp("tag_prefix owner input_dir")}`;
        }

        let tagPrefix = ctx.arg("tagPrefix"),
            owner = ctx.arg("owner"),
            inputDir = ctx.arg("inputDir");

        {
            let err;
            [tagPrefix, err] = getClient().tagManager.checkNew(tagPrefix, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        inputDir = path.resolve(projRoot, inputDir);

        let files = await fs.readdir(inputDir, { withFileTypes: true });
        files = files.filter(item => item.isFile());
        files.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));

        const out = [];

        for (const [i, file] of files.entries()) {
            try {
                const filePath = path.join(inputDir, file.name),
                    tagName = `${tagPrefix}${i + 1}`,
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
}

export default TagMassAddCommand;
