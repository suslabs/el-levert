import { getClient, getEmoji } from "../../LevertClient.js";

import TextCommand from "./TextCommand.js";

import CommandInfo from "./info/CommandInfo.js";
import CommandContext from "./context/CommandContext.js";

import ArrayUtil from "../../util/ArrayUtil.js";
import TypeTester from "../../util/TypeTester.js";

class Command extends TextCommand {
    static infoClass = CommandInfo;
    static contextClass = CommandContext;

    static {
        this._registerInfoGetters();
    }

    constructor(info) {
        super(info);

        const ownerLevel = getClient().permManager.getLevels().owner;

        if (this.ownerOnly) {
            this.info.allowed = ownerLevel;
        } else if (this.allowed === ownerLevel || this.allowed === "owner") {
            this.info.ownerOnly = true;
            this.info.allowed = ownerLevel;
        }
    }

    canExecute(perm) {
        if (!this.ownerOnly) {
            return getClient().permManager.allowed(perm, this.allowed);
        }

        return perm === this.allowed ? true : 0;
    }

    getSubcmds(perm) {
        const subList = Array.from(this.getSubcmdMap(false).values());

        if (perm == null) {
            return subList;
        }

        return subList.filter(subcmd => subcmd.canExecute(perm));
    }

    getSubcmdList(perm, includeAliases = true, sep = "|") {
        if (this.subcommand) {
            return "";
        }

        let subNames = [];

        if (perm == null) {
            subNames = this.getSubcmdNames(includeAliases);
        } else {
            const subcmds = this.getSubcmds(perm);

            subNames = includeAliases
                ? subcmds.flatMap(command => [command.name, ...command.aliases])
                : subcmds.map(cmd => cmd.name);
        }

        ArrayUtil.sort(subNames);
        return subNames.join(sep);
    }

    getHelpText() {
        return super.getHelpText(true);
    }

    getArgsHelp(args) {
        return super.getArgsHelp(args, true);
    }

    getSubcmdHelp(perm) {
        const subcmds = this.getSubcmdList(perm, false);
        return this._formatSubcmdHelp(subcmds, true);
    }

    createContext(data) {
        const context = super.createContext(data);
        return context instanceof CommandContext ? context : new this.constructor.contextClass(context);
    }

    async execute(context, options) {
        context = this.createContext(context);
        options = TypeTester.isObject(options) ? options : {};

        const perm = context.perm ?? (await Command._getPermLevel(context.message, options)),
            canExecute = this.canExecute(perm);

        switch (canExecute) {
            case 0:
                return `${getEmoji("warn")} Access denied.\nOnly the bot owner can execute this command.`;
            case false:
                return `${getEmoji("warn")} Access denied.\nOnly permission level ${this.allowed} and above can execute this command.`;
            default:
                context.perm = perm;
                return await super.execute(context);
        }
    }

    static async _getPermLevel(msg, options) {
        options = TypeTester.isObject(options) ? options : {};
        const { asLevel, asUser } = options;

        if (asLevel != null) {
            return asLevel;
        }

        const userId = asUser ?? msg?.author.id;

        if (userId == null) {
            return getClient().permManager.getLevels().default;
        }

        return await getClient().permManager.maxLevel(userId);
    }
}

export default Command;
