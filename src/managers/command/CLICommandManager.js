import TextCommandManager from "./TextCommandManager.js";

import { getClient } from "../../LevertClient.js";

class CLICommandManager extends TextCommandManager {
    static $name = "cliCommandManager";

    constructor(enabled) {
        const commandsDir = getClient().config.cliCommandsPath,
            commandPrefix = getClient().config.cliCmdPrefix;

        super(enabled, commandsDir, commandPrefix);
    }
}

export default CLICommandManager;
