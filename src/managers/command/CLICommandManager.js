import TextCommandManager from "./TextCommandManager.js";

import CLICommand from "../../structures/command/CLICommand.js";

import { getConfig } from "../../LevertClient.js";

class CLICommandManager extends TextCommandManager {
    static $name = "cliCommandManager";

    static commandClass = CLICommand;

    constructor(enabled) {
        const commandsDir = getConfig().cliCommandsPath,
            commandPrefix = getConfig().cliCmdPrefix;

        super(enabled, commandsDir, commandPrefix);
    }
}

export default CLICommandManager;
