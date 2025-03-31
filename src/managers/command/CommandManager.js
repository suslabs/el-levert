import TextCommandManager from "./TextCommandManager.js";

import Command from "../../structures/command/Command.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";

class CommandManager extends TextCommandManager {
    static $name = "commandManager";
    static loadPriority = 2;

    static commandClass = Command;

    constructor(enabled) {
        const commandsDir = getClient().config.commandsPath,
            commandPrefix = getClient().config.cmdPrefix,
            excludeDir = getClient().config.cliCommandsPath;

        super(enabled, commandsDir, commandPrefix, {
            excludeDirs: [excludeDir]
        });
    }

    isCommand(str, msg) {
        const author = msg.author.id;

        if (getClient().isBridgeBot(author)) {
            return this._getBridgeBotExp(author).test(str);
        } else {
            return super.isCommand(str);
        }
    }

    getCommands(perm) {
        const commands = super.getCommands();

        if (perm == null) {
            return commands;
        } else {
            return commands.filter(command => command.canExecute(perm));
        }
    }

    searchCommands(name) {
        const commands = this.getCommands(),
            command = commands.find(command => command.matches(name));

        return command ?? null;
    }

    getHelp(perm) {
        return super.getHelp(true, undefined, perm);
    }

    async load() {
        await super.load();
        this._setBridgeBotConfig();
    }

    _getCommandContent(str, msg) {
        const author = msg.author.id;

        if (getClient().isBridgeBot(author)) {
            const match = str.match(this._getBridgeBotExp(author));
            return Util.firstGroup(match, "content");
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
