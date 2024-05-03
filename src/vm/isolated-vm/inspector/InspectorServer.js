import { URL, URLSearchParams } from "node:url";
import WebSocket from "ws";

import { getLogger } from "../../../LevertClient.js";
import Util from "../../../util/Util.js";

const inspectorUrl = "devtools://devtools/bundled/inspector.html",
    inspectorOptions = {
        experiments: true,
        v8only: true
    };

function listener(socket) {
    getLogger().info("Inspector server: Recieved connection.");
    this.inspectorSocket = socket;

    if (this.inspectorContext === null) {
        this.closeSocket();
        return;
    }

    this.connectInspector();

    socket.on("error", err => {
        getLogger().error("Inspector websocket error:", err);
        this.disconnectInspector();
    });

    socket.on("close", code => {
        getLogger().info(`Inspector websocket closed:${Util.formatLog(code)}`);
        this.disconnectInspector();
    });

    socket.on("message", msg => {
        if (this.logPackets) {
            getLogger().info(`Recieved: ${msg}`);
        }

        try {
            this.inspectorContext?.inspector.sendMessage(msg);
        } catch (err) {
            getLogger().error("Error sending message to inspector:", err);
            socket.close();
        }
    });
}

function sendReply(msg) {
    if (this.inspectorSocket === null) {
        return;
    }

    if (this.logPackets) {
        etLogger().info(`Sending: ${msg}`);
    }

    this.inspectorSocket.send(msg);
}

class InspectorServer {
    constructor(enable, port, options = {}) {
        this.enable = enable;
        this.port = port;

        this.logPackets = options.logPackets ?? false;

        this.sendReply = sendReply.bind(this);
        this.inspectorContext = null;
        this.inspectorSocket = null;

        this.running = false;
    }

    getInspectorUrl() {
        const options = {
            ...inspectorOptions,
            ws: `localhost:${this.port}`
        };

        const url = new URL(inspectorUrl),
            search = new URLSearchParams(options);

        url.search = search;

        return url.toString();
    }

    setContext(context) {
        if (!this.enable) {
            return;
        }

        this.inspectorContext = context;
    }

    setup() {
        if (!this.enable) {
            return;
        }

        getLogger().info("Setting up inspector server...");

        this.websocketServer = new WebSocket.Server({
            port: this.port
        });

        this.bindEvents();

        this.running = true;
        getLogger().info("## Inspector: " + this.getInspectorUrl());
    }

    bindEvents() {
        this.websocketServer.on("connection", listener.bind(this));
        this.websocketServer.on("close", _ => getLogger().info("Inspector server closed."));
    }

    get inspectorConnected() {
        if (this.inspectorContext === null) {
            return false;
        }

        return this.inspectorContext.inspector.connected;
    }

    connectInspector() {
        if (this.inspectorContext === null) {
            return;
        }

        this.inspectorContext.inspector.onConnection();
    }

    disconnectInspector() {
        if (this.inspectorContext === null) {
            return;
        }

        this.inspectorContext.inspector.onDisconnect();
    }

    closeSocket() {
        if (this.inspectorSocket === null) {
            return;
        }

        if (this.inspectorSocket.readyState !== WebSocket.CLOSED) {
            this.inspectorSocket.close();
        }

        getLogger.info("Closed inspector socket.");
    }

    deleteReferences() {
        this.disconnectInspector();
        this.closeSocket();

        this.inspectorContext = null;
        this.inspectorSocket = null;

        this.running = false;
    }

    executionFinished() {
        if (!this.enable) {
            return;
        }

        this.deleteReferences();
    }

    close() {
        if (!this.enable) {
            return;
        }

        this.websocketServer.close();
        this.deleteReferences();

        getLogger().info("Closed inspector server.");
    }
}

export default InspectorServer;
