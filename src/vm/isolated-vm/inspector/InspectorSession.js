import { URL, URLSearchParams } from "node:url";

import WebSocket from "ws";

import { getLogger } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import TypeTester from "../../../util/TypeTester.js";

import InspectorPacketParser from "./InspectorPacketParser.js";

import getCloseReason from "../../../util/misc/wsCloseReason.js";

class InspectorSession {
    static inspectorUrl = "devtools://devtools/bundled/js_app.html";
    static inspectorCompatUrl = "devtools://devtools/bundled/inspector.html";
    static inspectorOptions = {
        experiments: true,
        v8only: true
    };

    static faviconUrl = "https://nodejs.org/static/images/favicons/favicon.ico";

    constructor(server, options) {
        options = TypeTester.isObject(options) ? options : {};

        this.server = server;
        this.options = options;

        this.uuid = options.uuid ?? "";
        this.mode = options.mode ?? "";
        this.userId = options.userId ?? null;

        this.title = options.title ?? `el-levert[${process.pid}]`;
        this.description = options.description ?? "node.js instance";
        this.url = options.url ?? "file://";

        this.logPackets = options.logPackets ?? false;
        this.actionTimeout = options.actionTimeout ?? 0;

        this._inspectorContexts = [];
        this._inspectorSocket = null;
        this._actionTimeoutId = null;

        this.packetParser = new InspectorPacketParser(this);
    }

    get inspectorConnected() {
        return this._getContext()?.inspector.connected ?? false;
    }

    get wsPath() {
        return `/${this.uuid}`;
    }

    get listPath() {
        return this.mode === "user" ? `/${this.uuid}/json/list` : "/json/list";
    }

    get versionPath() {
        return this.mode === "user" ? `/${this.uuid}/json/version` : "/json/version";
    }

    getAttachInfo(host) {
        host = this._normalizeHost(host);

        const websocketUrl = this._getWebSocketUrl(host),
            listUrl = this._getHttpUrl(host, this.listPath),
            devtoolsUrl = this._getDevtoolsUrl(host, true),
            launchConfig = {
                type: "node",
                request: "attach",
                name: "Attach to User Inspector",
                websocketAddress: websocketUrl,
                skipFiles: ["<node_internals>/**"]
            };

        return {
            devtoolsUrl,
            listUrl,
            launchConfig,
            uuid: this.uuid,
            websocketUrl
        };
    }

    getTargetInfo(host) {
        host = this._normalizeHost(host);

        return {
            description: this.description,
            devtoolsFrontendUrl: this._getDevtoolsUrl(host),
            devtoolsFrontendUrlCompat: this._getDevtoolsUrl(host, true),
            faviconUrl: InspectorSession.faviconUrl,
            id: this.uuid,
            title: this.title,
            type: "node",
            url: this.url,
            webSocketDebuggerUrl: this._getWebSocketUrl(host)
        };
    }

    getVersionInfo() {
        return {
            Browser: `node.js/${process.version}`,
            "Protocol-Version": "1.1"
        };
    }

    sendReply = msg => {
        if (this._inspectorSocket === null) {
            return;
        }

        if (!this.packetParser.parseOutgoing(msg)) {
            this._closeSocket();
            return;
        }

        this.logPackets && getLogger().debug(`Sending: ${msg}`);
        this._inspectorSocket.send(msg);
    };

    pushContext(context) {
        this._disconnectInspector();
        this._inspectorContexts.push(context);
        this._connectInspector();
    }

    popContext(context) {
        this._disconnectInspector();

        const idx = this._inspectorContexts.lastIndexOf(context);

        if (idx !== -1) {
            this._inspectorContexts.splice(idx, 1);
        }

        if (!Util.empty(this._inspectorContexts)) {
            this._connectInspector();
            return;
        }

        this._closeSocket();
        this.server?.onSessionEmpty(this);
    }

    attachSocket(socket) {
        if (this._inspectorSocket !== null) {
            socket.close();
            return;
        }

        getLogger().debug("Inspector server: Recieved connection.");
        this._inspectorSocket = socket;

        if (this._getContext() === null) {
            getLogger().info("No script is running. Disconnecting inspector.");
            this._closeSocket();
            return;
        }

        this._connectInspector();

        socket.on("error", err => {
            getLogger().error("Inspector websocket closing with error:", err);
            this._onSocketClosed();
        });

        socket.on("close", code => {
            getLogger().debug(`Inspector websocket closed with code: ${code} (${getCloseReason(code)})`);
            this._onSocketClosed();
        });

        socket.on("message", msg => {
            msg = msg.toString("utf-8");
            this.logPackets && getLogger().debug(`Recieved: ${msg}`);

            if (!this.packetParser.parseIncoming(msg)) {
                socket.close();
                return;
            }

            try {
                this._getContext()?.inspector.sendMessage(msg);
            } catch (err) {
                getLogger().error("Error occured while sending message to inspector:", err);
                socket.close();
            }
        });
    }

    startActionTimeout() {
        if (this.mode !== "user" || !Number.isFinite(this.actionTimeout) || this.actionTimeout <= 0) {
            return;
        }

        this.clearActionTimeout();
        this._actionTimeoutId = setTimeout(() => this._onActionTimeout(), this.actionTimeout);
    }

    resetActionTimeout() {
        this.startActionTimeout();
    }

    clearActionTimeout() {
        if (this._actionTimeoutId !== null) {
            clearTimeout(this._actionTimeoutId);
            this._actionTimeoutId = null;
        }
    }

    close() {
        this._disconnectInspector();
        this._closeSocket();
        this._inspectorContexts.length = 0;
        this.clearActionTimeout();
    }

    _getContext() {
        return this._inspectorContexts.at(-1) ?? null;
    }

    _getWebSocketUrl(host) {
        return `ws://${host}${this.wsPath}`;
    }

    _getHttpUrl(host, pathname) {
        return `http://${host}${pathname}`;
    }

    _getDevtoolsUrl(host, compat = false) {
        const options = {
            ...InspectorSession.inspectorOptions,
            ws: `${host}${this.wsPath}`
        };

        const url = new URL(compat ? InspectorSession.inspectorCompatUrl : InspectorSession.inspectorUrl),
            search = new URLSearchParams(options);

        url.search = search;
        return url.toString();
    }

    _normalizeHost(host) {
        return Util.nonemptyString(host) ? host : `127.0.0.1:${this.server?.port ?? 80}`;
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

        this.clearActionTimeout();

        if (context === null) {
            return;
        }

        context.inspector.onDisconnect();
    }

    _closeSocket() {
        if (this._inspectorSocket === null) {
            return;
        }

        const socket = this._inspectorSocket;
        this._inspectorSocket = null;

        if (socket.readyState !== WebSocket.CLOSED) {
            socket.close();
        }

        getLogger().debug("Closed inspector socket.");
    }

    _onActionTimeout() {
        this._actionTimeoutId = null;
        getLogger().info(`Inspector session ${this.uuid} timed out waiting for a debugger action.`);
        this._closeSocket();
    }

    _onSocketClosed() {
        this._inspectorSocket = null;
        this._disconnectInspector();
    }
}

export default InspectorSession;
