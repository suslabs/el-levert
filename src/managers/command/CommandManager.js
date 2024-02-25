import { getClient } from "../../LevertClient.js";
import BaseCommandManager from "./BaseCommandManager.js";

class CommandManager extends BaseCommandManager {
    constructor() {
        const commandsDir = getClient().config.commandsPath,
            commandPrefix = getClient().config.cmdPrefix;

        super(true, commandsDir, commandPrefix);
    }
}

export default CommandManager;
