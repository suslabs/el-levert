import TextCommandContext from "./TextCommandContext.js";

class CLICommandContext extends TextCommandContext {
    static defaultValues = {
        ...TextCommandContext.defaultValues,
        handler: null,
        line: ""
    };

    static dataProps = [...TextCommandContext.dataProps, "handler", "line"];

    constructor(data) {
        super(data);

        this.line ||= this.raw;
    }
}

export default CLICommandContext;
