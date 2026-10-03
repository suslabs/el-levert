import { readFileSync } from "node:fs";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import GatewayClient from "./GatewayClient.js";

import Util from "../src/util/Util.js";
import FileUtil from "../src/util/misc/FileUtil.js";

let config;

try {
    config = JSON.parse(readFileSync("./config/config.json", "utf-8"));
} catch (err) {
    config = {
        websocketPort: 8081
    };
}

const port = config.websocketPort ?? 8081,
    url = `ws://localhost:${port}`;

const argv = yargs(hideBin(process.argv))
    .usage("Usage: node ./scripts/vscode-debug.js <file> [payload]")
    .demandCommand(1, "Error: No file path specified.")
    .alias("help", "h")
    .help("help")
    .version(false)
    .parseSync();

const [filePathArg, payloadArg] = argv._.map(String),
    filePath = FileUtil.resolve(filePathArg);

let fileContent;

try {
    fileContent = readFileSync(filePath, "utf-8");
} catch (err) {
    console.error(`Error reading file "${filePath}":`, err.message);
    process.exit(1);
}

const sourceUrl = FileUtil.toFileUrl(filePath);

let extraData = {};

if (Util.nonemptyString(payloadArg)) {
    try {
        extraData = JSON.parse(payloadArg);
    } catch (err) {
        console.error(`Error parsing debug payload "${payloadArg}":`, err.message);
        process.exit(1);
    }
}

async function main() {
    const client = new GatewayClient(url, { clientId: `vscode_debug_${Math.floor(Math.random() * 10000)}` });

    client.on("inspector_ready", data => {
        console.log(`Inspector ready. Target URL: ${data}`);
    });

    try {
        await client.connect();

        const res = await client.sendRequest("vm_eval", {
            ...extraData,
            code: fileContent,
            debug: true,
            sourceUrl
        });

        console.log("\n--- Script Output ---");
        console.log(typeof res.data.output === "object" ? JSON.stringify(res.data.output, null, 2) : res.data.output);
        console.log("---------------------\n");

        client.close();
        process.exit(0);
    } catch (err) {
        console.error("\n--- Execution Error ---");
        console.error(err.message);
        console.error("-----------------------\n");

        client.close();
        process.exit(1);
    }
}

main();
