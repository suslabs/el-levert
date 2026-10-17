import { WebSocket } from "ws";

import Manager from "../Manager.js";

import GatewayServer from "../../gateway/GatewayServer.js";
import PacketParser from "../../gateway/PacketParser.js";
import PacketDispatcher from "../../gateway/PacketDispatcher.js";

import {
    ConnectPacket,
    DispatchPacket,
    HeartbeatAckPacket,
    InvalidSessionPacket
} from "../../structures/gateway/packets/index.js";
import { closeCodes } from "../../util/misc/WebsocketCloseCodes.js";

import { getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import RateLimiter from "../../util/misc/RateLimiter.js";

class GatewayManager extends Manager {
    static $name = "gatewayManager";

    static heartbeatInterval = 5 / Util.durationSeconds.milli;
    static identifyTimeout = 5 / Util.durationSeconds.milli;
    static heartbeatGracePeriod = 2 / Util.durationSeconds.milli;

    static packetLimit = 100;
    static rateLimitWindow = Util.durationSeconds.second / Util.durationSeconds.milli;

    constructor(enabled, port, options) {
        options = ObjectUtil.guaranteeObject(options);
        super(enabled, options);

        this.port = port;
        this.handleMessage = this.options.handleMessage;

        const packetLimit = this.options.packetLimit ?? this.constructor.packetLimit,
            rateLimitWindow = this.options.rateLimitWindow ?? this.constructor.rateLimitWindow;

        this.rateLimiter = new RateLimiter(packetLimit, rateLimitWindow);
        this.gatewayServer = new GatewayServer(this.port, options);
        this.sessions = new Map();

        this._connectionCounter = 1;
        this._active = false;

        this._handleConnection = this._handleConnection.bind(this);
        this._handleMessage = this._handleMessage.bind(this);
        this._handleClose = this._handleClose.bind(this);
        this._handleError = this._handleError.bind(this);
    }

    get active() {
        return this._active;
    }

    set active(value) {
        if (this._active === value) {
            return;
        }

        this._active = value;
        value ? this.load() : this.unload();
    }

    get sockets() {
        return this.gatewayServer.sockets;
    }

    load() {
        if (this.gatewayServer.websocketServer !== null || !this._active) {
            return;
        }

        this._setupServerEvents();
        this.gatewayServer.start();
    }

    unload() {
        this.gatewayServer.stop();
        this.sessions.clear();
        this.rateLimiter.clear();
    }

    handleIdentify(socket, clientId) {
        if (!Util.nonemptyString(clientId)) {
            this._rejectSocket(
                socket,
                "Missing clientId in IDENTIFY payload.",
                closeCodes.NOT_AUTHENTICATED,
                "Missing clientId"
            );
            return;
        }

        if (this._isClientIdConnected(clientId)) {
            this._rejectDuplicate(socket, clientId);
            return;
        }

        const sessionId = this._createSessionId();

        this.sessions.set(clientId, sessionId);
        this._activateSocket(socket, clientId, sessionId);

        getLogger().info(`WebSocket client identified: ${clientId} (Session: ${sessionId})`);
    }

    handleResume(socket, clientId, sessionId) {
        if (!Util.nonemptyString(clientId) || !Util.nonemptyString(sessionId)) {
            this._rejectSocket(
                socket,
                "Missing clientId or sessionId in RESUME payload.",
                closeCodes.NOT_AUTHENTICATED,
                "Missing credentials"
            );
            return;
        }

        if (this._isClientIdConnected(clientId)) {
            this._rejectDuplicate(socket, clientId, true);
            return;
        }

        const storedSessionId = this.sessions.get(clientId);

        if (storedSessionId !== sessionId) {
            getLogger().warn(`WebSocket resume failed: Invalid session for "${clientId}".`);
            this._rejectSocket(socket, "Invalid session ID.", closeCodes.SESSION_TIMEOUT, "Invalid session");
            return;
        }

        this._activateSocket(socket, clientId, sessionId);

        getLogger().info(`WebSocket client resumed session: ${clientId} (Session: ${sessionId})`);
    }

    handleHeartbeat(socket) {
        if (!socket.identified) {
            this._closeSocket(socket, closeCodes.NOT_AUTHENTICATED, "Not authenticated");
            return;
        }

        this._sendPacket(socket, new HeartbeatAckPacket());
        this._resetHeartbeatTimeout(socket);
    }

    _createSessionId() {
        return `sess_${this._connectionCounter++}`;
    }

    _clearSocketTimers(socket) {
        if (typeof socket.identifyTimeout !== "undefined" && socket.identifyTimeout !== null) {
            clearTimeout(socket.identifyTimeout);
            socket.identifyTimeout = null;
        }

        if (typeof socket.heartbeatTimeout !== "undefined" && socket.heartbeatTimeout !== null) {
            clearTimeout(socket.heartbeatTimeout);
            socket.heartbeatTimeout = null;
        }
    }

    _sendPacket(socket, packet) {
        if (socket.readyState !== socket.OPEN) {
            return;
        }

        socket.send(packet.serialize());
    }

    _closeSocket(socket, code, reason) {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close(code, reason);
        }
    }

    _resetHeartbeatTimeout(socket) {
        this._clearSocketTimers(socket);

        socket.heartbeatTimeout = setTimeout(() => {
            getLogger().warn(`WebSocket client heartbeat timeout (ID: ${socket.clientId})`);
            this._closeSocket(socket, closeCodes.SESSION_TIMEOUT, "Session timed out (heartbeat not received)");
        }, this.constructor.heartbeatInterval + this.constructor.heartbeatGracePeriod);
    }

    _activateSocket(socket, clientId, sessionId) {
        socket.clientId = clientId;
        socket.sessionId = sessionId;
        socket.identified = true;

        this._clearSocketTimers(socket);
        this._sendPacket(socket, new DispatchPacket("READY", { clientId, sessionId }));
        this._resetHeartbeatTimeout(socket);
    }

    _isClientIdConnected(clientId) {
        for (const activeSocket of this.sockets) {
            if (activeSocket.clientId === clientId) {
                return true;
            }
        }

        return false;
    }

    _rejectSocket(socket, msg, code, reason) {
        this._sendPacket(socket, new InvalidSessionPacket(null, { message: msg }));
        this._closeSocket(socket, code, reason);
    }

    _rejectDuplicate(socket, clientId, resume = false) {
        const msg = `Client ID "${clientId}" is already connected.`,
            logSuffix = resume ? " (RESUME)" : "";

        getLogger().warn(`WebSocket connection rejected${logSuffix}: ${msg}`);

        this._rejectSocket(socket, msg, closeCodes.UNKNOWN_OPCODE, msg);
    }

    _getClientId(socket) {
        return socket.clientId ?? "unidentified";
    }

    _handleConnection(socket, req) {
        const ip = req.socket.remoteAddress;

        socket.identified = false;
        socket.clientId = null;
        socket.sessionId = null;

        getLogger().info(`WebSocket connection established from ${ip}. Waiting for IDENTIFY...`);

        this._sendPacket(socket, new ConnectPacket(null, { heartbeat_interval: this.constructor.heartbeatInterval }));

        socket.identifyTimeout = setTimeout(() => {
            if (!socket.identified) {
                getLogger().warn(`WebSocket connection from ${ip} timed out waiting for IDENTIFY.`);
                this._closeSocket(socket, closeCodes.NOT_AUTHENTICATED, "Identify timeout");
            }
        }, this.constructor.identifyTimeout);
    }

    async _handleMessage(socket, data, isBinary) {
        if (isBinary) {
            return;
        }

        if (!this.rateLimiter.check(socket)) {
            getLogger().warn(`WebSocket client (${this._getClientId(socket)}) rate limit exceeded.`);
            this._closeSocket(socket, closeCodes.RATE_LIMITED, "Rate limited");
            return;
        }

        let parsedJson;

        try {
            parsedJson = JSON.parse(data.toString());
        } catch (err) {
            getLogger().warn("Received invalid JSON from WebSocket:", err.message);
            socket.send(
                JSON.stringify({
                    status: "error",
                    data: "Invalid JSON format"
                })
            );
            return;
        }

        if (typeof parsedJson.op === "number") {
            let packet;

            try {
                packet = PacketParser.parse(data.toString());
            } catch (err) {
                getLogger().warn("Invalid control packet:", err.message);
                this._closeSocket(socket, closeCodes.UNKNOWN_OPCODE, "Invalid control packet");
                return;
            }

            PacketDispatcher.dispatchServer(packet, this, socket);
            return;
        }

        if (!socket.identified) {
            getLogger().warn("Ignored command execution from unidentified socket.");
            this._closeSocket(socket, closeCodes.NOT_AUTHENTICATED, "Not authenticated");
            return;
        }

        if (typeof this.handleMessage === "function") {
            try {
                await this.handleMessage(parsedJson, socket);
            } catch (err) {
                getLogger().error("Error handling websocket packet:", err);
            }
        }
    }

    _handleClose(socket, code, reason) {
        this._clearSocketTimers(socket);
        this.rateLimiter.reset(socket);
        getLogger().info(`WebSocket client (ID: ${this._getClientId(socket)}) disconnected`);
    }

    _handleError(socket, err) {
        this._clearSocketTimers(socket);
        this.rateLimiter.reset(socket);
        getLogger().error(`WebSocket client (ID: ${this._getClientId(socket)}) error:`, err);
    }

    _setupServerEvents() {
        this.gatewayServer.on("connection", this._handleConnection);
        this.gatewayServer.on("message", this._handleMessage);
        this.gatewayServer.on("close", this._handleClose);
        this.gatewayServer.on("error", this._handleError);
        this.gatewayServer.on("server_error", err => {
            getLogger().error("WebSocket server error:", err);
        });
    }
}

export default GatewayManager;
