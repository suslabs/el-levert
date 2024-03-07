import { getClient } from "../../LevertClient.js";
import BaseCommandManager from "./BaseCommandManager.js";

class CommandManager extends BaseCommandManager {
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
