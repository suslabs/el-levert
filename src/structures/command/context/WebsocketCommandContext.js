import BaseCommandContext from "./BaseCommandContext.js";

class WebsocketCommandContext extends BaseCommandContext {
    static defaultValues = {
        ...BaseCommandContext.defaultValues,
        handler: null,
        socket: null,
        id: null,
        clientId: null,
        args: null
    };

    static dataProps = [...BaseCommandContext.dataProps, "handler", "socket", "id", "clientId", "args"];

    constructor(data) {
        super(data);

        this.args = this._parseArgs(this.args ?? data.args);
    }

    async reply(status, data) {
        this.markReplied();
        return await this.handler.contextReply(this, status, data);
    }

    async send(status, data) {
        return await this.reply(status, data);
    }

    _parseArgs(rawArgs) {
        return this.command.parseArguments(rawArgs, this);
    }
}

export default WebsocketCommandContext;
