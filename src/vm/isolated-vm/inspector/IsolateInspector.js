import { getLogger } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";

import VMError from "../../../errors/VMError.js";

class IsolateInspector {
    constructor(enable, options) {
        this.enable = enable;

        if (enable && typeof options.sendReply !== "function") {
            throw new VMError("No reply function provided");
        }

        this.sendReply = options.sendReply;

        this.inspectorConnected = false;
    }

    create(isolate) {
        if (!this.enable) {
            return;
        }

        this.isolate = isolate;
        const inspectorChannel = isolate.createInspectorSession();

        const wrappedReply = function (msg) {
            try {
                this.sendReply(msg);
            } catch (err) {
                getLogger().error(err);
                this.disposeChannel();
            }
        }.bind(this);

        inspectorChannel.onResponse = (_, msg) => wrappedReply(msg);
        inspectorChannel.onNotification = wrappedReply;

        this.inspectorChannel = inspectorChannel;
        this.inspectorConnected = false;
    }

    sendMessage(msg) {
        const str = String(msg);
        this.inspectorChannel.dispatchProtocolMessage(str);
    }

    dispose() {
        if (!this.enable) {
            return;
        }

        try {
            this.inspectorChannel.dispose();
        } catch (err) {
            getLogger().error(err.message);
        }

        delete this.inspectorChannel;
        this.inspectorConnected = false;
    }

    async waitForConnection() {
        if (!this.enable) {
            return;
        }

        getLogger().info("Waiting for inspector connection...");
        await Util.waitForCondition(_ => this.inspectorConnected);
    }

    onConnection() {
        getLogger().info("Inspector connected.");
        this.inspectorConnected = true;
    }
}

export default IsolateInspector;
