import { getClient } from "../../LevertClient.js";
import BaseCommandManager from "./BaseCommandManager.js";

class CLICommandManager extends BaseCommandManager {
    constructor(enabled) {
        const commandsDir = getClient().config.cliCommandsPath,
            commandPrefix = getClient().config.cliCmdPrefix;

        super(enabled, commandsDir, commandPrefix);
    }
}

export default CLICommandManager;
