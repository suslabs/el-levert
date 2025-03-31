import Handler from "../Handler.js";

import { getClient, getLogger } from "../../LevertClient.js";
import Util from "../../util/Util.js";

class CLICommandHandler extends Handler {
    static $name = "cliCommandHandler";

    constructor(enabled, options) {
        super(enabled, options);
    }

    reply(level, ...data) {
        console[level](...data);
    }

    async execute(str) {
        if (!getClient().cliCommandManager.isCommand(str)) {
            return;
        }

        const [cmd, _name, args] = getClient().cliCommandManager.getCommand(str);

        if (cmd === null) {
            this.reply(
                "error",
                `Command "${_name}" not found. 
Use ${getClient().cliCommandManager.commandPrefix}help to get all available commands.`
            );

            return;
        }

        let out;

        try {
            out = await cmd.execute(args);
        } catch (err) {
            getLogger().error(`Encountered exception while executing command "${cmd.name}":`, err);
            return;
        }

        if (!Util.empty(out)) {
            this.reply("log", out);
            return;
        }
    }
}

export default CLICommandHandler;
