import TextCommandContext from "./TextCommandContext.js";

class CLICommandContext extends TextCommandContext {
    constructor(data = {}) {
        super(data);

        this.handler = data.handler ?? null;

        this.line = data.line ?? this.rawContent;
    }
}

export default CLICommandContext;
