import Handler from "../Handler.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class CLICommandHandler extends Handler {
    static $name = "cliCommandHandler";

    constructor(enabled) {
        super(enabled, {
            minResponseTime: 0,
            globalTimeLimit: 0
        });
    }

    reply(level, ...data) {
        if (CLICommandHandler._validConsoleLevels.includes(level)) {
            console[level](...data);
        } else {
            console.log(level, ...data);
        }
    }

    async execute(str) {
        if (!getClient().cliCommandManager.isCommand(str)) {
            return;
        }

        const [cmd, name, args] = getClient().cliCommandManager.getCommand(str);

        if (cmd === null) {
            this.reply(
                "error",
                `Command "${name}" not found. 
Use ${getClient().cliCommandManager.commandPrefix}help to get all available commands.`
            );

            return;
        }

        const executeMain = async () => {
            return await cmd.execute(args);
        };

        let out;

        try {
            out = await Util.runWithTimeout(executeMain, "Command execution timed out", this.globalTimeout);
        } catch (err) {
            getLogger().error(
                `Encountered exception while executing command "${cmd.name}":\n${err.stack ?? err.message}`
            );

            return;
        }

        this.reply("log", out);
        return;
    }

    static _validConsoleLevels = ["debug", "info", "log", "warn", "error"];
}

export default CLICommandHandler;
