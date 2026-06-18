import { URL, URLSearchParams } from "node:url";

import WebSocket from "ws";

import { getLogger } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import ObjectUtil from "../../../util/ObjectUtil.js";

import getCloseReason from "../../../util/misc/wsCloseReason.js";

class InspectorServer {
    static inspectorUrl = "devtools://devtools/bundled/inspector.html";

    static inspectorOptions = {
        experiments: true,
        v8only: true
    };

    constructor(enabled, port = 8080, options) {
        this.enabled = enabled;
        this.port = port;

        options = ObjectUtil.guaranteeObject(options);
        this.options = options;

        this.logPackets = options.logPackets ?? false;

        this.running = false;

        this._inspectorContexts = [];
        this._inspectorSocket = null;
    }

    get inspectorUrl() {
        const options = {
            ...InspectorServer.inspectorOptions,
            ws: `localhost:${this.port}`
        };

        const url = new URL(InspectorServer.inspectorUrl),
            search = new URLSearchParams(options);

        url.search = search;

        return url.toString();
    }

    get inspectorConnected() {
        return this._getContext()?.inspector.connected ?? false;
    }

    setup() {
        if (!this.enabled) {
            return;
        }

        getLogger().info("Setting up inspector server...");

        this.websocketServer = new WebSocket.Server({
            port: this.port
        });

        this._bindEvents();

        getLogger().info("## Inspector:\n" + this.inspectorUrl);
        this.running = true;
    }

    sendReply = msg => {
        if (this._inspectorSocket === null) {
            return;
        }

        this.logPackets && getLogger().debug(`Sending: ${msg}`);
        this._inspectorSocket.send(msg);
    };

    pushContext(context) {
        if (!this.enabled) {
            return;
        }

        this._disconnectInspector();
        this._inspectorContexts.push(context);
        this._connectInspector();
    }

    popContext(context) {
        if (!this.enabled) {
            return;
        }

        this._disconnectInspector();
        const idx = this._inspectorContexts.lastIndexOf(context);

        if (idx !== -1) {
            this._inspectorContexts.splice(idx, 1);
        }

        if (!Util.empty(this._inspectorContexts)) {
            this._connectInspector();
        } else {
            this._closeSocket();
            this._inspectorSocket = null;
            this.running = false;
        }
    }

    close() {
        if (!this.enabled) {
            return;
        }

        this.websocketServer.close();
        this._deleteReferences();

        getLogger().info("Closed inspector server.");
    }

    _listener = socket => {
        getLogger().debug("Inspector server: Recieved connection.");
        this._inspectorSocket = socket;

        if (this._getContext() === null) {
            getLogger().info("No script is running. Disconnecting inspector.");
            this._closeSocket();
            this._inspectorSocket = null;

            return;
        }

        this._connectInspector();

        socket.on("error", err => {
            getLogger().error("Inspector websocket closing with error:", err);
            this._disconnectInspector();
        });

        socket.on("close", code => {
            getLogger().debug(`Inspector websocket closed with code: ${code} (${getCloseReason(code)})`);
            this._disconnectInspector();
        });

        socket.on("message", msg => {
            msg = msg.toString("utf-8");
            this.logPackets && getLogger().debug(`Recieved: ${msg}`);

            try {
                this._getContext()?.inspector.sendMessage(msg);
            } catch (err) {
                getLogger().error("Error occured while sending message to inspector:", err);
                socket.close();
            }
        });
    };

    _socketClosed = () => {
        getLogger().debug("Inspector websocket server closed.");
    };

    _bindEvents() {
        this.websocketServer.on("connection", this._listener);
        this.websocketServer.on("close", this._socketClosed);
    }

    _getContext() {
        return this._inspectorContexts.at(-1) ?? null;
    }

    _connectInspector() {
        const context = this._getContext();

        if (context === null || this._inspectorSocket === null) {
            return;
        }

        context.inspector.onConnection();
    }

    _disconnectInspector() {
        const context = this._getContext();

        if (context === null) {
            return;
        }

        context.inspector.onDisconnect();
    }

    _closeSocket() {
        if (this._inspectorSocket === null) {
            return;
        }

        if (this._inspectorSocket.readyState !== WebSocket.CLOSED) {
            this._inspectorSocket.close();
        }

        getLogger().debug("Closed inspector socket.");
    }

    _deleteReferences() {
        this._disconnectInspector();
        this._closeSocket();

        this._inspectorContexts.length = 0;
        this._inspectorSocket = null;

        this.running = false;
    }
}

export default InspectorServer;
