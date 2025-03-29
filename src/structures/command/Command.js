import { inlineCode } from "discord.js";

import { getClient } from "../../LevertClient.js";

import TextCommand from "./TextCommand.js";

import Util from "../../util/Util.js";

class Command extends TextCommand {
    static defaultValues = {
        ...TextCommand.defaultValues,
        allowed: 0,
        ownerOnly: false
    };

    constructor(options) {
        super(options);
        this.allowed = options.allowed ?? 0;
        this.ownerOnly = options.ownerOnly ?? false;

        if (this.ownerOnly) {
            this.allowed = getClient().permManager.ownerLevel;
        } else if (this.allowed === getClient().permManager.ownerLevel) {
            this.ownerOnly = true;
        }
    }

    canExecute(perm) {
        if (!this.ownerOnly) {
            return perm >= this.allowed;
        }

        const canExecute = perm === getClient().permManager.ownerLevel;
        return canExecute ? true : 0;
    }

    getSubcmds(perm) {
        const subList = Array.from(this.getSubcmdMap(false).values());

        if (perm == null) {
            return subList;
        }

        const allowedSubcmds = subList.filter(subcmd => subcmd.canExecute(perm));
        return allowedSubcmds;
    }

    getSubcmdList(perm, includeAliases = true, sep = "|") {
        if (this.isSubcmd) {
            return "";
        }

        let subNames;

        if (perm == null) {
            subNames = this.getSubcmdNames(includeAliases);
        } else {
            const subcmds = this.getSubcmds(perm);

            if (includeAliases) {
                subNames = subcmds.flatMap(command => [command.name, ...command.aliases]);
            } else {
                subNames = subcmds.map(cmd => cmd.name);
            }
        }

        Util.sort(subNames);
        return subNames.join(sep);
    }

    getHelpText() {
        return super.getHelpText(true);
    }

    getArgsHelp(args) {
        return super.getArgsHelp(args, true);
    }

    getSubcmdHelp() {
        return super.getSubcmdHelp(true);
    }

    async execute(args, context = {}, options = {}) {
        context = { ...context };

        return await super.execute(args, context, async () => {
            const perm = await this._checkPermission(context.msg, options);

            if (typeof perm === "string") {
                return perm;
            } else {
                context.perm = perm;
            }
        });
    }

    async _checkPermission(msg, options) {
        const perm = await Command._getPermLevel(msg, options),
            canExecute = this.canExecute(perm);

        switch (canExecute) {
            case 0:
                return ":warning: Access denied.\nOnly the bot owner can execute this command.";
            case false:
                return `:warning: Access denied.\nOnly permission level ${this.allowed} and above can execute this command.`;
        }

        return perm;
    }

    static async _getPermLevel(msg, options) {
        const { asLevel, asUser } = options;

        if (asLevel != null) {
            return asLevel;
        }

        const userId = asUser ?? msg?.author.id;

        if (userId == null) {
            return getClient().permManager.getDefaultLevel();
        }

        return await getClient().permManager.maxLevel(msg.author.id);
    }
}

export default Command;
