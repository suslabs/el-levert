import replEval from "../../util/commands/replEval.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import VMUtil from "../../util/vm/VMUtil.js";

export default {
    name: "admin_eval",
    ownerOnly: true,
    category: "owner-only",

    handler: async function (args, msg) {
        const evalCmd = getClient().commandManager.searchCommands("eval");

        const parsed = await evalCmd.evalBase(args, msg),
            body = parsed.body;

        if (parsed.err !== null) {
            return parsed.err;
        }

        const out = await replEval(body, {
            getClient,
            Util
        });

        return VMUtil.formatOutput(out);
    }
};
