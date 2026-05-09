import { escapeMarkdown } from "discord.js";

import { getClient, getEmoji } from "../../LevertClient.js";

class TagSetTypeCommand {
    static info = {
        name: "set_type",
        parent: "tag",
        subcommand: true,
        allowed: "mod",
        arguments: [
            {
                name: "tagName",
                parser: "split",
                index: 0,
                lowercase: true
            },
            {
                name: "tagArgs",
                parser: "split",
                index: 1
            },
            {
                name: "type",
                from: "tagArgs",
                parser: "split",
                index: 0,
                lowercase: [true, true]
            },
            {
                name: "version",
                from: "tagArgs",
                parser: "split",
                index: 1,
                lowercase: [true, true]
            }
        ]
    };

    async handler(ctx) {

        if (ctx.argsText.length < 2) {
            return `${getEmoji("info")} ${this.getArgsHelp("name (version/type)")}`;
        }

        let t_name = ctx.arg("tagName");

        if (this.matchesSubcmd(t_name)) {
            return `${getEmoji("invalid")} **${escapeMarkdown(t_name)}** is a __command__, not a __tag__. You can't manipulate commands.`;
        }

        {
            let err;
            [t_name, err] = getClient().tagManager.checkName(t_name, false);

            if (err !== null) {
                return `${getEmoji("warn")} ${err}.`;
            }
        }

        let type = ctx.arg("type"),
            version = ctx.arg("version"),
            setVersion = type === "version";

        const tag = await getClient().tagManager.fetch(t_name);

        if (tag === null) {
            return `${getEmoji("warn")} Tag **${escapeMarkdown(t_name)}** doesn't exist.`;
        }

        if (setVersion) {
            tag.setVersion(version);
        } else {
            tag.setType(type);
        }

        try {
            await getClient().tagManager.updateProps(t_name, tag, {
                validateNew: false,
                checkExisting: false
            });
        } catch (err) {
            if (err.name !== "TagError") {
                throw err;
            }

            return `${getEmoji("warn")} ${err.message}.`;
        }

        return `${getEmoji("ok")} Updated tag **${escapeMarkdown(t_name)}**.`;
    }
}

export default TagSetTypeCommand;
