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
}

export default TextCommandInfo;
