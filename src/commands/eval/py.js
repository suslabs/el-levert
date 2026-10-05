import { getConfig } from "../../LevertClient.js";

class PythonEvalCommand {
    static info = {
        name: "py",
        parent: "eval",
        subcommand: true,
        args: "<script>",
        description: "Execute Python code in an isolated interpreter environment.",
        usage: "- <script>: Python code to execute, or provide a file attachment.",
        parser: {
            requireArgs: true
        }
    };

    load() {
        return getConfig().enableOtherLangs;
    }

    handler(ctx) {
        return this.parentCmd.altevalBase(ctx.argsText, ctx.msg, 71, {
            allowFilePath: this.parentCmd.canUseFilePath(ctx)
        });
    }
}

export default PythonEvalCommand;
