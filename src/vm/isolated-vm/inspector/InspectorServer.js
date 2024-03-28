import { URL, URLSearchParams } from "url";
import WebSocket from "ws";

import { getLogger } from "../../../LevertClient.js";

const inspectorUrl = "devtools://devtools/bundled/inspector.html",
    inspectorOptions = {
        experiments: true,
        v8only: true
    };

function listener(socket) {
    if (this.inspectorContext === null) {
        socket.close();
        return;
    }

    this.inspectorSocket = socket;
    this.inspectorContext.inspector.onConnection();

    socket.on("error", err => {
        getLogger().error(err.message);
        this.inspectorContext?.inspector.dispose();
    });

    socket.on("close", (code, reason) => {
        getLogger().info(`Websocket closed: ${code}, ${reason}`);
        this.inspectorContext?.inspector.dispose();
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

        getLogger().info("## Inspector: " + this.getInspectorUrl());
    }

    bindEvents() {
        this.websocketServer.on("connection", listener.bind(this));
        this.websocketServer.on("close", _ => getLogger().info("Inspector server closed."));
    }

    executionFinished() {
        if (!this.enable) {
            return;
        }

        this.inspectorSocket.close();

        this.inspectorContext = null;
        this.inspectorSocket = null;
    }

    close() {
        if (!this.enable) {
            return;
        }

        this.websocketServer.close();

        this.inspectorContext = null;
        this.inspectorSocket = null;
    }
}

export default InspectorServer;
