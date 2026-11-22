import AITool from "../AITool.js";
import ToolParams from "../ToolParams.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import { getClient, getConfig } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import TypeTester from "../../../util/TypeTester.js";

class ExecuteJavascriptTool extends AITool {
    static info = {
        name: "execute_javascript",
        phase: AIPhases.running,
        description:
            "Run JavaScript in the bot's eval sandbox for nontrivial arithmetic, simulation or comparisons. Runs as a script, not a function body: make the result the FINAL evaluated expression (no return, no console.log).",
        parameters: ToolParams.object(
            {
                code: ToolParams.string('JavaScript source, e.g. "const perSec = 144 * 20; perSec * 60".')
            },
            ["code"]
        )
    };

    static maxOutputLength = 4000;

    isAvailable(session) {
        return getConfig().enableEval && session.request.hasMessage;
    }

    getStatus() {
        return "Running code";
    }

    async execute(args, session) {
        const code = String(args.code ?? "");

        if (Util.empty(code.trim())) {
            return { error: "code is required." };
        }

        const out = await getClient().tagVM.runScript(code, session.request.scriptValues);

        const text = TypeTester.isObject(out) ? JSON.stringify(out) : String(out ?? "");
        return { output: Util.trimString(text, ExecuteJavascriptTool.maxOutputLength) };
    }
}

export default ExecuteJavascriptTool;
