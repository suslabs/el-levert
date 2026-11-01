class InspectorPacketHandler {
    handle(parser, packet) {}
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

export {
    InspectorPacketHandler,
    InspectorActionPacketHandler,
    InspectorPausedPacketHandler,
    InspectorResumedPacketHandler
};
