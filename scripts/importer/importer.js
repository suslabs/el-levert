import yargs from "yargs";

import DBImporter from "./DBImporter.js";

(async _ => {
    const args = yargs(process.argv.slice(2))
        .version(false)
        .scriptName("importer")
        .usage("Usage: $0 -json path")
        .option("json", {
            alias: "i",
            describe: "Tag JSON path",
            type: "string",
            nargs: 1
        })
        .option("p1", {
            describe: "Purge Leveret 1 tags",
            nargs: 0
        }).argv;

    if (args.json) {
        const importer = new DBImporter(args.json);

        await importer.loadDatabase();
        await importer.updateDatabase();
    } else if (args.p1) {
        const importer = new DBImporter();

        await importer.loadDatabase();
        await importer.purge1();
    }
})();
