import TypeTester from "@el-levert/common/util/TypeTester.js";
import ObjectUtil from "@el-levert/common/util/ObjectUtil.js";

import {
    InspectorActionPacketHandler,
    InspectorPausedPacketHandler,
    InspectorResumedPacketHandler
} from "./InspectorPacketHandlers.js";

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
        options = ObjectUtil.guaranteeObject(options);

        this.session = session ?? null;
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
}

export default InspectorPacketParser;
