import { getLogger } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import VMUtil from "../../../util/vm/VMUtil.js";

import VMError from "../../../errors/VMError.js";

class IsolateInspector {
    constructor(enabled, options) {
        this.enabled = enabled;

        this.options = options;

        if (enabled && typeof options.sendReply !== "function") {
            throw new VMError("No reply function provided");
        } else {
            this.sendReply = options.sendReply;
        }

        this.connectTimeout = options.connectTimeout ?? 60 / Util.durationSeconds.milli;

        this.connected = false;

        this._channel = null;
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
            wrappedReply = IsolateInspector._getWrappedReplyFunc(this);

        channel.onResponse = (_, msg) => wrappedReply(msg);
        channel.onNotification = wrappedReply;

        this._channel = channel;
        this._wrappedReply = wrappedReply;

        getLogger().debug("Created channel.");
    }

    async waitForConnection() {
        if (!this.enabled) {
            return;
        }

        getLogger().info("Waiting for inspector connection...");

        await Util.waitForCondition(
            () => this.connected,
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
        this._channel.dispatchProtocolMessage(str);
    }

    onConnection() {
        if (this.connected) {
            return;
        }

        getLogger().info("Inspector connected.");

        if (this._channel === null) {
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
        if (this._channel === null) {
            return;
        }

        try {
            this._channel.dispose();
        } catch (err) {
            getLogger().error("Error occured while disposing inspector channel:", err);
        }

        this._channel = null;
        delete this._wrappedReply;
    }

    static _getWrappedReplyFunc(inspector) {
        return function wrappedReply(msg) {
            try {
                this.sendReply(msg);
            } catch (err) {
                getLogger().error("Inspector reply error:", err);
                this.dispose();
            }
        }.bind(inspector);
    }
}

export default IsolateInspector;
