import { readFileSync } from "node:fs";
import readline from "node:readline";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import GatewayClient from "./GatewayClient.js";

import Util from "../src/util/Util.js";

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

let rl = null;

function splitArgs(str) {
    str = str.trim();
    const idx = str.indexOf(" ");

    if (idx === -1) {
        return [str, ""];
    }

    return [str.slice(0, idx), str.slice(idx + 1).trim()];
}

function parseValue(value) {
    if (typeof value !== "string") {
        return value;
    }

    value = value.trim();

    if (Util.empty(value)) {
        return "";
    }

    if (!["{", "[", '"'].includes(Util.first(value)) && !["true", "false", "null"].includes(value)) {
        return value;
    }

    return JSON.parse(value);
}

function parseKeyValueArgs(words) {
    const data = {};

    for (const word of words) {
        const idx = word.indexOf("=");

        if (idx === -1) {
            continue;
        }

        data[word.slice(0, idx)] = parseValue(word.slice(idx + 1));
    }

    return data;
}

function parseInteractiveLine(line) {
    line = line.trim();

    if (line.startsWith("{")) {
        try {
            return JSON.parse(line);
        } catch (err) {
            console.error("Invalid JSON:", err.message);
            return null;
        }
    }

    const [op, rest] = splitArgs(line),
        data = {};

    if (op === "vm_eval" || op === "eval") {
        let codeRest = rest,
            debug = false;

        if (rest.startsWith("debug ")) {
            debug = true;
            codeRest = splitArgs(rest)[1];
        } else if (rest === "debug") {
            debug = true;
            codeRest = "";
        }

        data.code = codeRest;
        data.debug = debug;
    } else if (op === "execute_tag") {
        const words = Util.empty(rest) ? [] : rest.split(/\s+/),
            first = Util.first(words),
            hasName = first != null && !first.includes("="),
            tagName = hasName ? words.shift() : "";

        let argsEnd = words.findIndex(word => word.includes("="));

        if (argsEnd === -1) {
            argsEnd = words.length;
        }

        data.args = words.slice(0, argsEnd).join(" ");

        if (Util.nonemptyString(tagName)) {
            data.name = tagName;
        }

        Object.assign(data, parseKeyValueArgs(words.slice(argsEnd)));
    } else {
        Object.assign(data, parseKeyValueArgs(Util.empty(rest) ? [] : rest.split(/\s+/)));
    }

    return {
        op,
        data
    };
}

function startRepl(client) {
    if (rl !== null) {
        rl.prompt();
        return;
    }

    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "gateway> "
    });

    rl.prompt();

    rl.on("line", async line => {
        line = line.trim();

        if (line === "exit") {
            client.close();
            process.exit(0);
        }

        if (Util.empty(line)) {
            rl.prompt();
            return;
        }

        const parsed = parseInteractiveLine(line);

        if (parsed === null || typeof parsed.op === "undefined" || Util.empty(parsed.op)) {
            rl.prompt();
            return;
        }

        try {
            const res = await client.sendRequest(parsed.op, parsed.data);

            console.log("\n--- Received Response ---");
            console.log(JSON.stringify(res, null, 2));
            console.log("-------------------------\n");
        } catch (err) {
            console.error("Error executing command:", err.message);
        }

        rl.prompt();
    });
}

async function main() {
    const argv = yargs(hideBin(process.argv))
        .usage("Usage: node ./scripts/websocket-client.js [operation] [args...]")
        .alias("help", "h")
        .help("help")
        .version(false)
        .parseSync();

    const args = argv._.map(String);

    if (!Util.empty(args)) {
        const op = args[0],
            data = {};

        if (op === "vm_eval" || op === "eval") {
            data.code = args[1] ?? "";

            for (const arg of args.slice(2)) {
                if (arg === "debug") {
                    data.debug = true;
                }
            }

            Object.assign(data, parseKeyValueArgs(args.slice(2)));
        } else if (op === "execute_tag") {
            const rest = args.slice(1),
                first = Util.first(rest),
                hasName = first != null && !first.includes("="),
                offset = hasName ? 1 : 0;

            if (hasName) {
                data.name = first;
            }

            let argsEnd = rest.slice(offset).findIndex(arg => arg.includes("="));

            if (argsEnd === -1) {
                argsEnd = rest.length - offset;
            }

            data.args = rest.slice(offset, offset + argsEnd).join(" ");
            Object.assign(data, parseKeyValueArgs(rest.slice(offset + argsEnd)));
        } else {
            Object.assign(data, parseKeyValueArgs(args.slice(1)));
        }

        const client = new GatewayClient(url, { clientId: `cli_client_${Math.floor(Math.random() * 10000)}` });

        try {
            await client.connect();

            const res = await client.sendRequest(op, data);

            console.log("\n--- Received Response ---");
            console.log(JSON.stringify(res, null, 2));
            console.log("-------------------------\n");

            client.close();
            process.exit(0);
        } catch (err) {
            console.error("Error executing command:", err.message);

            client.close();
            process.exit(1);
        }
    } else {
        const client = new GatewayClient(url, { clientId: `cli_client_${Math.floor(Math.random() * 10000)}` });

        client.on("open", () => {
            startRepl(client);
        });

        client.on("inspector_ready", data => {
            console.log(`\n[Inspector Ready] ${data}`);

            if (rl !== null) {
                rl.prompt();
            }
        });

        client.connect();
    }
}

main();
