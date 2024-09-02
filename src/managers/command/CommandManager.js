import BaseCommandManager from "./BaseCommandManager.js";

import { getClient } from "../../LevertClient.js";

class CommandManager extends BaseCommandManager {
    static name = "commandManager";

    constructor() {
        const commandsDir = getClient().config.commandsPath,
            commandPrefix = getClient().config.cmdPrefix,
            excludeDir = getClient().config.cliCommandsPath;

        super(true, commandsDir, commandPrefix, {
            excludeDirs: [excludeDir]
        });
    }
}

export default CommandManager;
