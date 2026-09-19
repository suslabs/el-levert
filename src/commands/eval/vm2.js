import { getClient, getConfig } from "../../LevertClient.js";

class Vm2EvalCommand {
    static info = {
        name: "vm2",
        description: "Evaluate JavaScript code in the VM2 runtime.",
        parent: "eval",
        subcommand: true
    };

    load() {
        return getConfig().enableVM2;
    }

    async handler(ctx) {
        const parsed = await this.parentCmd.evalBase(ctx.argsText, ctx.msg, {
                allowFilePath: this.parentCmd.canUseFilePath(ctx)
            }),
            body = parsed.body;

        if (parsed.err !== null) {
            return parsed.err;
        }

        return await getClient().tagVM2.runScript(body, ctx.msg);
    }
}

export default Vm2EvalCommand;
