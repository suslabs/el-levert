import replEval from "../../util/commands/replEval.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import VMUtil from "../../util/vm/VMUtil.js";

class AdminEvalCommand {
    static info = {
        name: "admin_eval",
        ownerOnly: true,
        category: "owner-only"
    };

    async handler(ctx) {
        const evalCmd = getClient().commandManager.searchCommands("eval");

        const parsed = await evalCmd.evalBase(ctx.argsText, ctx.msg),
            body = parsed.body;

        if (parsed.err !== null) {
            return parsed.err;
        }

        const res = await replEval(body, {
                getClient,
                Util
            }),
            out = VMUtil.formatOutput(res);

        return [
            out,
            {
                type: "options",
                useConfigLimits: true
            }
        ];
    }
}

export default AdminEvalCommand;
