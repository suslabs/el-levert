import { getConfig } from "../../LevertClient.js";

class CEvalCommand {
    static info = {
        name: "c",
        parent: "eval",
        subcommand: true
    };

    load() {
        return getConfig().enableOtherLangs;
    }

    handler(ctx) {
        return this.parentCmd.altevalBase(ctx.argsText, ctx.msg, 75);
    }
}

export default CEvalCommand;
