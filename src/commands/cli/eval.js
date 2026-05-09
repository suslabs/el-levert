import replEval from "../../util/commands/replEval.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class EvalCommand {
    static info = {
        name: "eval"
    };

    async handler(ctx) {
        if (Util.empty(ctx.argsText)) {
            return "Can't eval an empty expression.";
        }

        return await replEval(ctx.argsText, {
            getClient,
            Util
        });
    }
}

export default EvalCommand;
