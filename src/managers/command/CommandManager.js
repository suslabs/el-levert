import BaseCommandManager from "./BaseCommandManager.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class CommandManager extends BaseCommandManager {
    static $name = "commandManager";
    static loadPriority = 2;

    constructor() {
        const commandsDir = getClient().config.commandsPath,
            commandPrefix = getClient().config.cmdPrefix,
            excludeDir = getClient().config.cliCommandsPath;

        super(true, commandsDir, commandPrefix, {
            excludeDirs: [excludeDir]
        });

        this._setBridgeBotConfig();
    }

    isCommand(str, msg) {
        const author = msg.author.id;

        if (getClient().isBridgeBot(author)) {
            return this._getBridgeBotExp(author).test(str);
        } else {
            return super.isCommand(str);
        }
    }

    _getCommandContent(str, msg) {
        const author = msg.author.id;

        if (getClient().isBridgeBot(author)) {
            const match = str.match(this._getBridgeBotExp(author));
            return Util.getFirstGroup(match, "content");
        } else {
            return super._getCommandContent(str);
        }
    }

    _wrapBridgeBotExp(exp) {
        const contentExp = `${this.commandPrefix}(?<content$1>.+)`;
        return new RegExp("^" + exp.source.replace(/\(\?<content(\d*?)>\)/g, contentExp));
    }

    _setBridgeBotConfig() {
        if (!getClient().useBridgeBot) {
            return;
        }

        const individual = getClient().individualBridgeBotFormats;
        this._individualBridgeBotExps = individual;

        if (individual) {
            const exp = getClient().bridgeBotExps;
            this._bridgeBotExps = new Map();

            exp.forEach((value, key) => {
                this._bridgeBotExps.set(key, this._wrapBridgeBotExp(value));
            });
        } else {
            const exp = getClient().bridgeBotExp;
            this._bridgeBotExp = this._wrapBridgeBotExp(exp);
        }
    }

    _getBridgeBotExp(id) {
        if (this._individualBridgeBotExps) {
            return this._bridgeBotExps.get(id);
        } else {
            return this._bridgeBotExp;
        }
    }
}

export default CommandManager;
