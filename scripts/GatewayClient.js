import { EventEmitter } from "node:events";

import { WebSocket } from "ws";

import PacketParser from "../src/gateway/PacketParser.js";

import { closeCodes } from "../src/structures/gateway/GatewayCloseCodes.js";
import HeartbeatPacket from "../src/structures/gateway/packets/HeartbeatPacket.js";
import IdentifyPacket from "../src/structures/gateway/packets/IdentifyPacket.js";
import ResumePacket from "../src/structures/gateway/packets/ResumePacket.js";

import Util from "../src/util/Util.js";

import ClientError from "../src/errors/ClientError.js";

class GatewayClient extends EventEmitter {
    static maxConnections = Infinity;
    static maxReconnectAttempts = 5;
    static reconnectDelay = 1000;
    static defaultJitter = 1000;

    static maxRPS = Infinity;
    static maxRetryCount = 5;
    static retryDelay = 1000;

    static connectTimeout = 5000;
    static pingInterval = 5000;
    static pongTimeout = 3000;

    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    constructor(url, options = {}) {
        super();

        this.url = url;
        this.options = options;

        this.clientId = typeof options.clientId === "string" ? options.clientId : "cli_client";
        this.sessionId = null;

        this.reconnectDelay = options.reconnectDelay ?? this.constructor.reconnectDelay;
        this.defaultJitter = options.defaultJitter ?? this.constructor.defaultJitter;
        this.maxReconnectAttempts = options.maxReconnectAttempts ?? this.constructor.maxReconnectAttempts;

        this.maxRPS = options.maxRPS ?? this.constructor.maxRPS;
        this.maxRetryCount = options.maxRetryCount ?? this.constructor.maxRetryCount;
        this.retryDelay = options.retryDelay ?? this.constructor.retryDelay;
        this.enableRetry = this.retryDelay > 0 && this.maxRetryCount > 0;

        this.connectTimeout = options.connectTimeout ?? this.constructor.connectTimeout;
        this.pingInterval = options.pingInterval ?? this.constructor.pingInterval;
        this.pongTimeout = options.pongTimeout ?? this.constructor.pongTimeout;

        this.ws = null;
        this.requestId = 1;
        this.pendingRequests = new Map();
        this.destroyed = false;
        this.connected = false;

        this._reconnectAttempts = 0;
        this._reconnectTimeout = null;
        this._connectTimeout = null;
        this._pingInterval = null;
        this._pingTimeout = null;

        this._tokens = this.maxRPS;
        this._lastRefillTime = Date.now();

        this._connectionReady = Promise.resolve();
        this._resolveConnection = null;
        this._rejectConnection = null;

        this._handleOpen = this._handleOpen.bind(this);
        this._handleError = this._handleError.bind(this);
        this._handleClose = this._handleClose.bind(this);
        this._handleMessage = this._handleMessage.bind(this);
    }

    connect(reconnect = false) {
        if (this.ws !== null) {
            return this._connectionReady;
        }

        if (this._reconnectTimeout !== null) {
            clearTimeout(this._reconnectTimeout);
            this._reconnectTimeout = null;
        }

        this._connectionReady = new Promise((resolve, reject) => {
            this._resolveConnection = resolve;
            this._rejectConnection = reject;
        });

        this.destroyed = false;
        if (!reconnect) {
            this._reconnectAttempts = 0;
        }
        this._connectSocket();

        return this._connectionReady;
    }

    reconnect() {
        if (this.ws === null) {
            return this.connect();
        }

        this._cleanupSocket();
        this._handleClose(1006, false);

        return this.connect();
    }

    close() {
        this.destroyed = true;

        if (this._reconnectTimeout !== null) {
            clearTimeout(this._reconnectTimeout);
            this._reconnectTimeout = null;
        }

        this._cleanupSocket();
        this.emit("close", 1000);
    }

    async sendRequest(op, data) {
        if (!this.enableRetry) {
            return await this._attemptSend(op, data);
        }

        return await this._sendWithRetry(op, data);
    }

    handleConnectPacket(packet) {
        this._startHeartbeat(packet.heartbeatInterval);

        if (Util.nonemptyString(this.sessionId)) {
            this._handleResume();
        } else {
            this._handleIdentify();
        }
    }

    handleDispatchPacket(packet) {
        switch (packet.eventName) {
            case "READY":
                this.clientId = packet.clientId;
                this.sessionId = packet.sessionId;
                this.connected = true;

                if (this._resolveConnection !== null) {
                    this._resolveConnection();
                    this._resolveConnection = null;
                    this._rejectConnection = null;
                }

                this.emit("open");
        }
    }

    handleHeartbeatAckPacket(packet) {
        if (this._pingTimeout !== null) {
            clearTimeout(this._pingTimeout);
            this._pingTimeout = null;
        }
    }

    handleInvalidSessionPacket(packet) {
        const msg = packet.message || "Invalid session";

        console.warn(`Invalid session: ${msg}`);

        this.sessionId = null;
        this._rejectConnectionAttempt(new ClientError(msg));

        this._cleanupSocket();
        this._handleClose(closeCodes.UNKNOWN_OPCODE, false);
    }

    static _connections = 0;

    static _increment() {
        if (this.maxConnections === Infinity) {
            return;
        }

        if (this._connections >= this.maxConnections) {
            throw new ClientError(`Maximum connections (${this.maxConnections}) exceeded.`);
        }

        this._connections++;
    }

    static _decrement() {
        if (this.maxConnections === Infinity) {
            return;
        }

        if (this._connections <= 0) {
            throw new ClientError("Connection count cannot be lower than 0");
        }

        this._connections--;
    }

    static _getRetryTime(base, jitter, error) {
        const time = base + (Math.random() * jitter - jitter / 2);
        return error ? time * (1 + Math.random() * 0.4) : time;
    }

    _connectSocket() {
        if (this.destroyed) {
            return;
        }

        try {
            this.constructor._increment();
        } catch (err) {
            console.error("Connection failed:", err.message);
            this.emit("error", err);
            return;
        }

        this.ws = new WebSocket(this.url);

        this.ws.on("open", this._handleOpen);
        this.ws.on("message", this._handleMessage);
        this.ws.on("close", this._handleClose);
        this.ws.on("error", this._handleError);

        this._connectTimeout = setTimeout(() => {
            if (this.ws !== null && !this.connected) {
                console.warn("Connection attempt timed out.");
                this._cleanupSocket();
                this._handleClose(1006);
            }
        }, this.connectTimeout);
    }

    _handleOpen() {
        this._reconnectAttempts = 0;

        if (this._connectTimeout !== null) {
            clearTimeout(this._connectTimeout);
            this._connectTimeout = null;
        }
    }

    _handleMessage(data) {
        let parsedJson;

        try {
            parsedJson = JSON.parse(data.toString());
        } catch (err) {
            console.error("Received invalid JSON from server:", err.message);
            return;
        }

        if (typeof parsedJson.op === "number") {
            let packet;

            try {
                packet = PacketParser.parse(data.toString());
            } catch (err) {
                console.error("Invalid control packet:", err.message);
                this._cleanupSocket();
                this._handleClose(closeCodes.UNKNOWN_OPCODE);
                return;
            }

            packet.handleClient(this);
            return;
        }

        if (parsedJson.status === "inspector_ready") {
            this.emit("inspector_ready", parsedJson.data);
            return;
        }

        const pending = this.pendingRequests.get(parsedJson.id);

        if (typeof pending !== "undefined") {
            this.pendingRequests.delete(parsedJson.id);

            if (parsedJson.status === "error") {
                pending.reject(new ClientError(parsedJson.data));
            } else {
                pending.resolve(parsedJson);
            }
        }
    }

    _scheduleReconnect() {
        if (this._reconnectAttempts >= this.maxReconnectAttempts) {
            console.error("Max reconnection attempts reached.");
            this.emit("max_reconnect_reached");
            return;
        }

        this._reconnectAttempts++;

        const baseDelay = this._reconnectAttempts * this.reconnectDelay,
            delay = this.constructor._getRetryTime(baseDelay, this.defaultJitter, false);

        console.log(
            `Disconnected. Reconnecting in ${(delay / 1000).toFixed(2)}s... (attempt ${this._reconnectAttempts}/${this.maxReconnectAttempts})`
        );

        this._reconnectTimeout = setTimeout(() => {
            this.connect(true);
        }, delay);
    }

    _handleClose(code, reconnect = !this.destroyed) {
        this._cleanupSocket();

        this._connectionReady = new Promise((resolve, reject) => {
            this._resolveConnection = resolve;
            this._rejectConnection = reject;
        });

        this.emit("close", code);

        for (const [id, pending] of this.pendingRequests.entries()) {
            pending.reject(new ClientError("Connection closed before response received."));
            this.pendingRequests.delete(id);
        }

        if (reconnect) {
            this._scheduleReconnect();
        }
    }

    _rejectConnectionAttempt(error) {
        if (this._rejectConnection !== null) {
            this._rejectConnection(error);
            this._resolveConnection = null;
            this._rejectConnection = null;
        }
    }

    _handleError(err) {
        this.emit("error", err);
        this._rejectConnectionAttempt(err);
    }

    _clearTimers() {
        if (this._connectTimeout !== null) {
            clearTimeout(this._connectTimeout);
            this._connectTimeout = null;
        }

        if (this._pingInterval !== null) {
            clearInterval(this._pingInterval);
            this._pingInterval = null;
        }

        if (this._pingTimeout !== null) {
            clearTimeout(this._pingTimeout);
            this._pingTimeout = null;
        }
    }

    _cleanupSocket() {
        if (this.ws === null) {
            return;
        }

        this.ws.removeAllListeners();
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.close();
        }
        this.ws = null;

        if (this.connected) {
            this.connected = false;
            this.constructor._decrement();
        }

        this._clearTimers();
    }

    async _acquireToken() {
        if (this.maxRPS === Infinity) {
            return;
        }

        for (;;) {
            const now = Date.now(),
                elapsed = (now - this._lastRefillTime) / 1000;

            const toAdd = Math.floor(elapsed * this.maxRPS);

            if (toAdd > 0) {
                this._tokens = Math.min(this.maxRPS, this._tokens + toAdd);
                this._lastRefillTime = now;
            }

            if (this._tokens > 0) {
                this._tokens--;
                return;
            } else {
                const refillDelay = 1000 / this.maxRPS;
                await this.constructor.delay(refillDelay);
            }
        }
    }

    async _attemptSend(op, data) {
        await this._connectionReady;
        await this._acquireToken();

        if (this.destroyed) {
            throw new ClientError("Client destroyed");
        }

        if (this.ws === null || this.ws.readyState !== WebSocket.OPEN) {
            throw new ClientError("Connection is not open.");
        }

        const id = String(this.requestId++);

        const packet = {
            id,
            op,
            data
        };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });

            this.ws.send(JSON.stringify(packet), err => {
                if (err) {
                    this.pendingRequests.delete(id);
                    reject(err);
                }
            });
        });
    }

    async _sendWithRetry(op, data) {
        let retries = 0;

        for (;;) {
            try {
                return await this._attemptSend(op, data);
            } catch (error) {
                if (this.destroyed) {
                    return;
                }

                if (++retries > this.maxRetryCount) {
                    throw error;
                }

                const delay = this.constructor._getRetryTime(this.retryDelay, this.defaultJitter, false);
                await this.constructor.delay(delay);
            }
        }
    }

    _sendHeartbeat() {
        if (this._pingTimeout !== null) {
            console.warn("Heartbeat timeout: ACK not received.");
            this._cleanupSocket();
            this._handleClose(1006);
            return;
        }

        this._pingTimeout = setTimeout(() => {
            console.warn("Heartbeat ACK timeout: connection lost.");
            this._cleanupSocket();
            this._handleClose(1006);
        }, this.pongTimeout);

        if (this.ws !== null && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(new HeartbeatPacket().serialize());
        }
    }

    _startHeartbeat(interval) {
        if (this._pingInterval !== null) {
            clearInterval(this._pingInterval);
        }

        this._pingInterval = setInterval(() => {
            this._sendHeartbeat();
        }, interval);
    }

    _handleIdentify() {
        if (this.ws !== null && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(new IdentifyPacket(null, { clientId: this.clientId }).serialize());
        }
    }

    _handleResume() {
        if (this.ws !== null && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(
                new ResumePacket(null, {
                    clientId: this.clientId,
                    sessionId: this.sessionId
                }).serialize()
            );
        }
    }
}

export default GatewayClient;
