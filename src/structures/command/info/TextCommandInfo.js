import BaseCommandInfo from "./BaseCommandInfo.js";

class TextCommandInfo extends BaseCommandInfo {
    static invalidValues = {
        ...BaseCommandInfo.invalidValues,
        category: "none"
    };

    static defaultValues = {
        ...BaseCommandInfo.defaultValues,
        args: "",
        description: "",
        usage: "",
        parser: {},
        aliases: [],
        helpArgs: ["help", "-help", "-h", "usage"],
        category: this.invalidValues.category,
        prefix: "",
        arguments: []
    };

    static dataProps = [
        ...BaseCommandInfo.dataProps,
        "args",
        "description",
        "usage",
        "parser",
        "aliases",
        "helpArgs",
        "category",
        "prefix",
        "arguments"
    ];

    toObject() {
        return {
            ...super.toObject(),
            args: this.args,
            description: this.description,
            usage: this.usage,
            parser: structuredClone(this.parser),
            aliases: structuredClone(this.aliases),
            helpArgs: structuredClone(this.helpArgs),
            category: this.category,
            prefix: this.prefix,
            arguments: structuredClone(this.arguments)
        };
    }
}

export default TextCommandInfo;
