import { URL, URLSearchParams } from "node:url";
import WebSocket from "ws";

import { getLogger } from "../../../LevertClient.js";
import Util from "../../../util/Util.js";

class InspectorServer {
    static inspectorUrl = "devtools://devtools/bundled/inspector.html";

    static inspectorOptions = {
        experiments: true,
        v8only: true
    };

    static listener(socket) {
        getLogger().debug("Inspector server: Recieved connection.");
        this._inspectorSocket = socket;

        if (this._inspectorContext === null) {
            getLogger().info("No script is running. Disconnecting inspector.");
            this._closeSocket();

            return;
        }

        this._connectInspector();

        socket.on("error", err => {
            getLogger().error("Inspector websocket error:", err);
            this._disconnectInspector();
        });

        socket.on("close", code => {
            getLogger().debug(`Inspector websocket closed:${Util.formatLog(code)}`);
            this._disconnectInspector();
        });

        socket.on("message", msg => {
            if (this.logPackets) {
                getLogger().debug(`Recieved: ${msg}`);
            }

            try {
                this._inspectorContext?.inspector.sendMessage(msg);
            } catch (err) {
                getLogger().error("Error occured while sending message to inspector:", err);
                socket.close();
            }
        });
    }

    constructor(enabled, port = 8080, options = {}) {
        this.enabled = enabled;
        this.port = port;

        this.options = options;

        this.logPackets = options.logPackets ?? false;

        const replyFunc = InspectorServer._sendReply.bind(this);
        this.sendReply = replyFunc;

        this.running = false;

        this._inspectorContext = null;
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
        if (this._inspectorContext === null) {
            return false;
        }

        return this._inspectorContext.inspector.connected;
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

    setContext(context) {
        if (!this.enabled) {
            return;
        }

        this._inspectorContext = context;
    }

    executionFinished() {
        if (!this.enabled) {
            return;
        }

        this._deleteReferences();
    }

    close() {
        if (!this.enabled) {
            return;
        }

        this.websocketServer.close();
        this._deleteReferences();

        getLogger().info("Closed inspector server.");
    }

    static _sendReply(msg) {
        if (this._inspectorSocket === null) {
            return;
        }

        if (this.logPackets) {
            getLogger().debug(`Sending: ${msg}`);
        }

        this._inspectorSocket.send(msg);
    }

    _bindEvents() {
        const listenerFunc = InspectorServer.listener.bind(this);
        this.websocketServer.on("connection", listenerFunc);

        this.websocketServer.on("close", _ => getLogger().debug("Inspector websocket server closed."));
    }

    _connectInspector() {
        if (this._inspectorContext === null) {
            return;
        }

        this._inspectorContext.inspector.onConnection();
    }

    _disconnectInspector() {
        if (this._inspectorContext === null) {
            return;
        }

        this._inspectorContext.inspector.onDisconnect();
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

        this._inspectorContext = null;
        this._inspectorSocket = null;

        this.running = false;
    }
}

export default InspectorServer;
