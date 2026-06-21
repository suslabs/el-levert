import TypeTester from "../../../util/TypeTester.js";

class InspectorPacketHandler {
    handle(_parser, _packet) {}
}

class InspectorActionPacketHandler extends InspectorPacketHandler {
    handle(parser) {
        parser.resetActionTimeout();
    }
}

class InspectorPausedPacketHandler extends InspectorPacketHandler {
    handle(parser) {
        parser.startActionTimeout();
    }
}

class InspectorResumedPacketHandler extends InspectorPacketHandler {
    handle(parser) {
        parser.clearActionTimeout();
    }
}

class InspectorPacketParser {
    static incomingHandlers = new Map(
        [
            "Debugger.continueToLocation",
            "Debugger.restartFrame",
            "Debugger.resume",
            "Debugger.stepInto",
            "Debugger.stepOut",
            "Debugger.stepOver"
        ].map(method => [method, new InspectorActionPacketHandler()])
    );

    static outgoingHandlers = new Map([
        ["Debugger.paused", new InspectorPausedPacketHandler()],
        ["Debugger.resumed", new InspectorResumedPacketHandler()]
    ]);

    constructor(session, options) {
        options = TypeTester.isObject(options) ? options : {};

        this.session = session;
        this.options = options;
    }

    parseIncoming(msg) {
        return this._parsePacket(msg, InspectorPacketParser.incomingHandlers);
    }

    parseOutgoing(msg) {
        return this._parsePacket(msg, InspectorPacketParser.outgoingHandlers);
    }

    startActionTimeout() {
        this.session?.startActionTimeout();
    }

    resetActionTimeout() {
        this.session?.resetActionTimeout();
    }

    clearActionTimeout() {
        this.session?.clearActionTimeout();
    }

    _parsePacket(msg, handlers) {
        const packet = this._getPacket(msg);

        if (packet === null) {
            return false;
        }

        const method = packet.method;

        if (typeof method === "string") {
            handlers.get(method)?.handle(this, packet);
        }

        return true;
    }

    _getPacket(msg) {
        if (msg instanceof Buffer) {
            msg = msg.toString("utf-8");
        }

        if (typeof msg !== "string") {
            return null;
        }

        try {
            const packet = JSON.parse(msg);
            return TypeTester.isObject(packet) ? packet : null;
        } catch (err) {
            return null;
        }
    }
}

export default InspectorPacketParser;
