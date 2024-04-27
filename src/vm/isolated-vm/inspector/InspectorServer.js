import { URL, URLSearchParams } from "node:url";
import WebSocket from "ws";

import { getLogger } from "../../../LevertClient.js";

const inspectorUrl = "devtools://devtools/bundled/inspector.html",
    inspectorOptions = {
        experiments: true,
        v8only: true
    };

function listener(socket) {
    this.inspectorSocket = socket;

    if (this.inspectorContext === null) {
        this.closeSocket();
        return;
    }

    this.connectInspector();

    socket.on("error", err => {
        getLogger().error(err);
        this.disconnectInspector();
    });

    socket.on("close", code => {
        getLogger().info(`Websocket closed: ${JSON.stringify(code)}`);
        this.disconnectInspector();
    });

    socket.on("message", msg => {
        try {
            this.inspectorContext?.inspector.sendMessage(msg);
        } catch (err) {
            getLogger().error("Error sending message to inspector: ", err);
            socket.close();
        }
    });
}

function sendReply(msg) {
    if (this.inspectorSocket === null) {
        return;
    }

    this.inspectorSocket.send(msg);
}

class InspectorServer {
    constructor(enable, port) {
        this.enable = enable;
        this.port = port;

        this.inspectorContext = null;
        this.inspectorSocket = null;

        this.running = false;

        this.sendReply = sendReply.bind(this);
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
        this.inspectorContext = context;
    }

    setup() {
        if (!this.enable) {
            return;
        }

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
    }
}

export default InspectorServer;
