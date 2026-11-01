import BaseCommand from "./BaseCommand.js";

import WebsocketCommandContext from "./context/WebsocketCommandContext.js";
import WebsocketCommandInfo from "./info/WebsocketCommandInfo.js";

import WebsocketCommandParser from "../../parsers/websocket/WebsocketCommandParser.js";

import Util from "../../util/Util.js";

import CommandError from "@el-levert/common/errors/CommandError.js";

class WebsocketCommand extends BaseCommand {
    static infoClass = WebsocketCommandInfo;
    static contextClass = WebsocketCommandContext;

    static {
        this._registerInfoGetters();
    }

    constructor(info) {
        super(info);

        this.argumentsParser = new WebsocketCommandParser(this.arguments, false);
        this.responseParser = new WebsocketCommandParser(this.response, true);
    }

    parseArguments(data, context) {
        return this._parseWithParser(this.argumentsParser, data, context);
    }

    parseResponse(data, context) {
        return this._parseWithParser(this.responseParser, data, context);
    }

    async execute(context) {
        context = this.createContext(context);

        const data = await super.execute(context);
        return this.parseResponse(data ?? {}, context);
    }

    _parseWithParser(parser, data, context) {
        const session = parser.parse(data ?? {}, context);

        if (!session.valid) {
            throw new CommandError(Util.first(session.issues).message);
        }

        const value = {};

        for (const [name, result] of session.results) {
            value[name] = result.value;
        }

        return value;
    }
}

export default WebsocketCommand;
