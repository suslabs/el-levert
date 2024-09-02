import BaseCommandManager from "./BaseCommandManager.js";

import { getClient } from "../../LevertClient.js";

class CLICommandManager extends BaseCommandManager {
    static name = "cliCommandManager";

    constructor(enabled) {
        const commandsDir = getClient().config.cliCommandsPath,
            commandPrefix = getClient().config.cliCmdPrefix;

        super(enabled, commandsDir, commandPrefix);
    }
}

export default CLICommandManager;
