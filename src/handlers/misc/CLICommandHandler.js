import Handler from "../Handler.js";

import { getClient, getLogger } from "../../LevertClient.js";

import CLICommandContext from "../../structures/command/context/CLICommandContext.js";
import ConsoleLevels from "./ConsoleLevels.js";

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
        if (ConsoleLevels.has(level)) {
            console[level](...data);
        } else {
            console.log(level, ...data);
        }
    }

    async execute(str) {
        if (!getClient().cliCommandManager.isCommand(str)) {
            return;
        }

        const [cmd, name, , parsed] = getClient().cliCommandManager.getCommand(str);

        if (cmd === null) {
            this.reply(
                "error",
                `Command "${name}" not found. 
Use ${getClient().cliCommandManager.commandPrefix}help to get all available commands.`
            );

            return;
        }

        const executeMain = async () => {
            return await cmd.execute(
                new CLICommandContext({
                    command: cmd,
                    commandName: name,
                    raw: str,
                    argsText: parsed.argsText,
                    parseResult: parsed,
                    handler: this,
                    line: str
                })
            );
        };

        let out = null;

        try {
            out = await executeMain();
        } catch (err) {
            getLogger().error(
                `Encountered exception while executing command "${cmd.name}":\n${Util.getErrorMessage(err)}`
            );

            return;
        }

        this.reply("log", out);
        return;
    }
}
export default CLICommandHandler;
