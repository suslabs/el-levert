import VMError from "../../../errors/VMError.js";

import { getLogger } from "../../../LevertClient.js";
import VMUtil from "../../../util/vm/VMUtil.js";
import Util from "../../../util/Util.js";

function getWrappedReplyFunc(inspector) {
    return function wrappedReply(msg) {
        try {
            this.sendReply(msg);
        } catch (err) {
            getLogger().error("Inspector reply error:", err);
            this.dispose();
        }
    }.bind(inspector);
}

class IsolateInspector {
    constructor(enabled, options) {
        this.enabled = enabled;

        this.options = options;

        if (enabled && typeof options.sendReply !== "function") {
            throw new VMError("No reply function provided");
        } else {
            this.sendReply = options.sendReply;
        }

        this.connectTimeout = 60 / Util.durationSeconds.milli;

        this.channel = null;
        this.connected = false;
    }

    create(isolate) {
        if (!this.enabled) {
            return;
        }

        getLogger().debug("Creating inspector channel...");

        if (typeof isolate === "undefined") {
            isolate = this.isolate;
        } else {
            this.isolate = isolate;
        }

        const channel = isolate.createInspectorSession(),
            wrappedReply = getWrappedReplyFunc(this);

        channel.onResponse = (_, msg) => wrappedReply(msg);
        channel.onNotification = wrappedReply;

        this.channel = channel;
        this.wrappedReply = wrappedReply;

        getLogger().debug("Created channel.");
    }

    async waitForConnection() {
        if (!this.enabled) {
            return;
        }

        getLogger().info("Waiting for inspector connection...");

        await Util.waitForCondition(
            _ => this.connected,
            new VMError("Inspector wasn't connected in time"),
            this.connectTimeout
        );
    }

    getDebuggerCode(code) {
        if (!this.enabled) {
            return code;
        }

        return VMUtil.addDebuggerStmt(code);
    }

    sendMessage(msg) {
        const str = String(msg);
        this.channel.dispatchProtocolMessage(str);
    }

    onConnection() {
        if (this.connected) {
            return;
        }

        getLogger().info("Inspector connected.");

        if (this.channel === null) {
            this.create();
        }

        this.connected = true;
    }

    onDisconnect() {
        if (!this.connected) {
            return;
        }

        getLogger().info("Inspector disconnected.");

        this.dispose();
        this.connected = false;
    }

    dispose() {
        if (this.channel === null) {
            return;
        }

        try {
            this.channel.dispose();
        } catch (err) {
            getLogger().error("Error occured while disposing inspector channel:", err);
        }

        this.channel = null;
        delete this.wrappedReply;
    }
}

export default IsolateInspector;
