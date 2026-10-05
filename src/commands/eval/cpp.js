import { getConfig } from "../../LevertClient.js";

class CppEvalCommand {
    static info = {
        name: "cpp",
        parent: "eval",
        subcommand: true,
        args: "<script>",
        description: "Compile and execute C++ source code in an external execution sandbox.",
        usage: "- <script>: C++ source code to compile and run, or supply a file attachment.",
        parser: {
            requireArgs: true
        }
    };

    load() {
        return getConfig().enableOtherLangs;
    }

    handler(ctx) {
        return this.parentCmd.altevalBase(ctx.argsText, ctx.msg, 76, {
            allowFilePath: this.parentCmd.canUseFilePath(ctx)
        });
    }
}

export default CppEvalCommand;
