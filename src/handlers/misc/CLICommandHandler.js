import Handler from "../Handler.js";

import { getClient, getLogger } from "../../LevertClient.js";

class CLICommandHandler extends Handler {
    static $name = "cliCommandHandler";

    constructor(enabled, options) {
        super(enabled, options);
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
