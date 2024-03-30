import { getLogger } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";

import VMError from "../../../errors/VMError.js";

class IsolateInspector {
    constructor(enable, options) {
        this.enable = enable;

        if (enable && typeof options.sendReply !== "function") {
            throw new VMError("No reply function provided");
        } else {
            this.sendReply = options.sendReply;
        }

        this.connectTimeout = 60000;

        this.channel = null;
        this.connected = false;
    }

    create(isolate) {
        if (!this.enable) {
            return;
        }

        if (typeof isolate === "undefined") {
            isolate = this.isolate;
        } else {
            this.isolate = isolate;
        }

        const channel = isolate.createInspectorSession();

        const wrappedReply = function (msg) {
            try {
                this.sendReply(msg);
            } catch (err) {
                getLogger().error(err);
                this.disposeChannel();
            }
        }.bind(this);

        channel.onResponse = (_, msg) => wrappedReply(msg);
        channel.onNotification = wrappedReply;

        this.channel = channel;
    }

    sendMessage(msg) {
        const str = String(msg);
        this.channel.dispatchProtocolMessage(str);
    }

    dispose() {
        if (this.channel === null) {
            return;
        }

        try {
            this.channel.dispose();
        } catch (err) {
            getLogger().error(err);
        }

        this.channel = null;
    }

    async waitForConnection() {
        if (!this.enable) {
            return;
        }

        getLogger().info("Waiting for inspector connection...");

        await Util.waitForCondition(
            _ => this.connected,
            new VMError("Inspector wasn't connected in time"),
            this.connectTimeout
        );
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

    onDisconnection() {
        if (!this.connected) {
            return;
        }

        getLogger().info("Inspector disconnected.");

        this.dispose();
        this.connected = false;
    }
}

export default IsolateInspector;
