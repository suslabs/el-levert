import PacketParser from "../PacketParser.js";

import RpcRequestPacket from "../structures/packets/RpcRequestPacket.js";
import RpcResponsePacket from "../structures/packets/RpcResponsePacket.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";

import VMError from "../../errors/VMError.js";

class RPCChannel {
    static defaultTimeout = (30 * Util.durationSeconds.second) / Util.durationSeconds.milli;

    constructor(socket, options) {
        options = ObjectUtil.guaranteeObject(options);

        const timeout = options.timeout ?? this.constructor.defaultTimeout;

        this.socket = socket;
        this.timeout = timeout;

        this._nextId = 1;
        this._pendingCalls = new Map();
        this._handlers = new Map();

        this._onMessage = this._onSocketMessage.bind(this);
        this._bindSocket();
    }

    register(name, fn) {
        this._handlers.set(name, fn);
    }

    call(method, ...args) {
        const id = this._nextId++;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._pendingCalls.delete(id);
                reject(new VMError(`RPC call "${method}" timed out`));
            }, this.timeout);

            this._pendingCalls.set(id, { resolve, reject, timer });

            const packet = new RpcRequestPacket(null, { id, method, args });
            this.socket.send(packet.serialize());
        });
    }

    async handlePacket(packet) {
        if (packet instanceof RpcRequestPacket) {
            await this._handleRequest(packet);
        } else if (packet instanceof RpcResponsePacket) {
            this._handleResponse(packet);
        }
    }

    destroy() {
        this._unbindSocket();

        for (const entry of this._pendingCalls.values()) {
            clearTimeout(entry.timer);
            entry.reject(new VMError("RPC channel destroyed"));
        }

        this._pendingCalls.clear();
        this._handlers.clear();
    }

    _bindSocket() {
        if (typeof this.socket.on === "function") {
            this.socket.on("message", this._onMessage);
        }
    }

    _unbindSocket() {
        if (typeof this.socket.off === "function") {
            this.socket.off("message", this._onMessage);
        } else if (typeof this.socket.removeListener === "function") {
            this.socket.removeListener("message", this._onMessage);
        }
    }

    _onSocketMessage(data, isBinary) {
        if (isBinary) {
            return;
        }

        let packet;

        try {
            packet = PacketParser.parse(data.toString());
        } catch {
            return;
        }

        this.handlePacket(packet);
    }

    async _handleRequest(packet) {
        const callId = packet.callId,
            method = packet.method,
            args = packet.args;

        const handler = this._handlers.get(method);

        if (typeof handler !== "function") {
            const errPacket = new RpcResponsePacket(null, {
                id: callId,
                ok: false,
                error: { message: `Unknown RPC method: ${method}` }
            });

            this.socket.send(errPacket.serialize());
            return;
        }

        try {
            const result = await handler(...args);

            const resPacket = new RpcResponsePacket(null, {
                id: callId,
                ok: true,
                result
            });

            this.socket.send(resPacket.serialize());
        } catch (err) {
            const errPacket = new RpcResponsePacket(null, {
                id: callId,
                ok: false,
                error: {
                    name: err.name ?? "VMError",
                    message: err.message ?? String(err),
                    stack: err.stack
                }
            });

            this.socket.send(errPacket.serialize());
        }
    }

    _handleResponse(packet) {
        const callId = packet.callId,
            ok = packet.ok,
            result = packet.result,
            error = packet.error;

        const entry = this._pendingCalls.get(callId);

        if (typeof entry === "undefined") {
            return;
        }

        clearTimeout(entry.timer);
        this._pendingCalls.delete(callId);

        if (ok) {
            entry.resolve(result);
        } else {
            const message = error?.message ?? "RPC call failed";
            let err;

            switch (error?.name) {
                case "SyntaxError":
                    err = new SyntaxError(message);
                    break;
                case "TypeError":
                    err = new TypeError(message);
                    break;
                case "RangeError":
                    err = new RangeError(message);
                    break;
                case "ReferenceError":
                    err = new ReferenceError(message);
                    break;
                default:
                    err = new VMError(message);
                    if (typeof error?.name === "string") {
                        err.name = error.name;
                    }
                    break;
            }

            if (typeof error?.stack === "string") {
                err.stack = error.stack;
                err.remoteStack = error.stack;
            }

            entry.reject(err);
        }
    }
}

export default RPCChannel;
