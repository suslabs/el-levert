import replEval from "../../util/commands/replEval.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import VMUtil from "../../util/vm/VMUtil.js";

export default {
    name: "eval",

    handler: async args => {
        if (Util.empty(args)) {
            return "Can't eval an empty expression.";
        }

        const out = await replEval(args, {
            getClient,
            Util
        });

        return VMUtil.formatOutput(out);
    }
};
