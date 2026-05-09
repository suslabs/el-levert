import BaseCommandInfo from "./BaseCommandInfo.js";

class TextCommandInfo extends BaseCommandInfo {
    static dataProps = [
        ...BaseCommandInfo.dataProps,
        "description",
        "usage",
        "aliases",
        "helpArgs",
        "category",
        "prefix",
        "arguments"
    ];

    static invalidValues = {
        ...BaseCommandInfo.invalidValues,
        category: "none"
    };

    static defaultValues = {
        ...BaseCommandInfo.defaultValues,
        description: "",
        usage: "",
        aliases: [],
        helpArgs: ["help", "-help", "-h", "usage"],
        category: this.invalidValues.category,
        prefix: "",
        arguments: []
    };

    toObject() {
        return {
            ...super.toObject(),
            description: this.description,
            usage: this.usage,
            aliases: structuredClone(this.aliases),
            helpArgs: structuredClone(this.helpArgs),
            category: this.category,
            prefix: this.prefix,
            arguments: structuredClone(this.arguments)
        };
    }
}

export default TextCommandInfo;
