import TextCommandContext from "./TextCommandContext.js";

class CLICommandContext extends TextCommandContext {
    constructor(data) {
        super(data);

        this.handler = this.data.handler ?? null;

        this.line = this.data.line ?? this.raw;
    }
}

export default CLICommandContext;
