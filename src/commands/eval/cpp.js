import { getConfig } from "../../LevertClient.js";

class CppEvalCommand {
    static info = {
        name: "cpp",
        parent: "eval",
        subcommand: true
    };

    load() {
        return getConfig().enableOtherLangs;
    }

    handler(ctx) {
        return this.parentCmd.altevalBase(ctx.argsText, ctx.msg, 76);
    }
}

export default CppEvalCommand;
