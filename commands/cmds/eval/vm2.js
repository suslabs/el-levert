import { getClient } from "../../../LevertClient.js";

export default {
    name: "vm2",
    parent: "eval",
    subcommand: true,   
    handler: async function(args, msg) {
        const parsed = await this.parentCmd.evalBase(args, msg),
              body = parsed.body;

        if(typeof parsed.err !== "undefined") {
            return parsed.err;
        }
        
        return await getClient().tagVM2.runScript(body, msg);
    }
}