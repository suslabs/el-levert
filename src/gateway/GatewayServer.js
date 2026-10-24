import { EventEmitter } from "node:events";

import { WebSocketServer } from "ws";

import { getLogger } from "../LevertClient.js";

import ObjectUtil from "../util/ObjectUtil.js";

class GatewayServer extends EventEmitter {
    static defaultHost = "127.0.0.1";
    static defaultPort = 8081;

    constructor(host, port, options) {
        super();

        options = ObjectUtil.guaranteeObject(options);

        this.host = host ?? GatewayServer.defaultHost;
        this.port = port ?? GatewayServer.defaultPort;
        this.options = options;

        this.websocketServer = null;
        this.sockets = new Set();

        this._handleConnection = this._handleConnection.bind(this);
    }

    start() {
        if (this.websocketServer !== null) {
            return;
        }

        getLogger().info(`Starting WebSocket server on ${this.host}:${this.port}...`);

        this.websocketServer = new WebSocketServer({
            host: this.host,
            port: this.port
        });

        this.websocketServer.on("connection", this._handleConnection);
        this.websocketServer.on("error", err => {
            this.emit("server_error", err);
        });
    }

    stop() {
        if (this.websocketServer === null) {
            return;
        }

        getLogger().info("Stopping WebSocket server...");

        for (const socket of this.sockets) {
            socket.removeAllListeners("close");
            socket.removeAllListeners("error");
            socket.close();
        }

        this.sockets.clear();

        this.websocketServer.close();
        this.websocketServer = null;
    }

    _handleConnection(socket, req) {
        this.sockets.add(socket);

        this.emit("connection", socket, req);

        socket.on("message", (data, isBinary) => {
            this.emit("message", socket, data, isBinary);
        });

        socket.on("close", (code, reason) => {
            this.sockets.delete(socket);
            this.emit("close", socket, code, reason);
        });

        socket.on("error", err => {
            this.sockets.delete(socket);
            this.emit("error", socket, err);
        });
    }
}

export default GatewayServer;
