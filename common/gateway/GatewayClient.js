import { EventEmitter } from "node:events";

import WebSocket from "ws";

import PacketParser from "./PacketParser.js";

import Util from "../util/Util.js";
import ObjectUtil from "../util/ObjectUtil.js";

import PacketError from "../errors/PacketError.js";

class GatewayClient extends EventEmitter {
    static defaultReconnectInterval = (2 * Util.durationSeconds.second) / Util.durationSeconds.milli;

    constructor(url, options) {
        super();

        options = ObjectUtil.guaranteeObject(options);

        const reconnect = options.reconnect ?? true,
            reconnectInterval = options.reconnectInterval ?? this.constructor.defaultReconnectInterval;

        this.url = url;
        this.reconnect = reconnect;
        this.reconnectInterval = reconnectInterval;
        this.logger = options.logger ?? null;

        this.socket = null;
        this.connected = false;

        this._reconnectTimer = null;
        this._intentionalClose = false;
    }

    connect() {
        if (this.socket !== null) {
            return;
        }

        this._intentionalClose = false;
        this._clearReconnectTimer();

        this.logger?.info(`Connecting to gateway at ${this.url}...`);

        const socket = new WebSocket(this.url);

        this.socket = socket;
        this._bindSocketEvents(socket);
    }

    disconnect() {
        this._intentionalClose = true;
        this._clearReconnectTimer();

        if (this.socket === null) {
            return;
        }

        this.socket.removeAllListeners();
        this.socket.close();
        this.socket = null;
        this.connected = false;
    }

    send(packet) {
        if (!this.connected || this.socket === null) {
            throw new PacketError("Cannot send packet: gateway client is not connected");
        }

        const payload = typeof packet === "string" ? packet : packet.serialize();
        this.socket.send(payload);
    }

    _clearReconnectTimer() {
        if (this._reconnectTimer !== null) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
    }

    _scheduleReconnect() {
        if (!this.reconnect || this._intentionalClose || this._reconnectTimer !== null) {
            return;
        }

        this.logger?.info(`Reconnecting in ${this.reconnectInterval} ms...`);

        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this.connect();
        }, this.reconnectInterval);
    }

    _bindSocketEvents(socket) {
        socket.on("open", () => {
            this.connected = true;
            this.emit("open", socket);
        });

        socket.on("message", (data, isBinary) => {
            if (isBinary) {
                this.emit("binary", data);
                return;
            }

            try {
                const packet = PacketParser.parse(data.toString());
                this.emit("packet", packet);
            } catch (err) {
                this.emit("parse_error", err, data);
            }
        });

        socket.on("close", (code, reason) => {
            const wasConnected = this.connected;

            this.connected = false;
            this.socket = null;

            this.emit("close", code, reason);

            if (wasConnected && !this._intentionalClose) {
                this._scheduleReconnect();
            }
        });

        socket.on("error", err => {
            this.emit("error", err);
        });
    }
}

export default GatewayClient;

