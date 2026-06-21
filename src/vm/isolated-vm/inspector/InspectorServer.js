import http from "node:http";
import { URL } from "node:url";
import crypto from "node:crypto";

import { WebSocketServer } from "ws";

import { getLogger } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import TypeTester from "../../../util/TypeTester.js";

import InspectorSession from "./InspectorSession.js";
import { InspectorModes } from "./InspectorModes.js";

import VMError from "../../../errors/VMError.js";

class InspectorServer {
    constructor(enabled, port = 8080, options) {
        this.enabled = enabled;
        this.port = port;

        options = TypeTester.isObject(options) ? options : {};
        this.options = options;

        this.mode = options.mode ?? InspectorModes.console;
        this.logPackets = options.logPackets ?? false;
        this.userInspectorActionTimeout = options.userInspectorActionTimeout ?? 0;

        this.running = false;

        this._sessionUsers = new Map();
        this._sessions = new Map();
        this._consoleSession = null;
    }

    get inspectorConnected() {
        return this._consoleSession?.inspectorConnected ?? false;
    }

    get inspectorUrl() {
        return this._consoleSession?.getAttachInfo(`localhost:${this.port}`).devtoolsUrl ?? "";
    }

    setup() {
        if (!this.enabled) {
            return;
        }

        getLogger().info("Setting up inspector server...");

        this.httpServer = http.createServer(this._httpReqHandler);
        this.websocketServer = new WebSocketServer({
            noServer: true
        });

        this._bindEvents();

        if (this.mode === InspectorModes.console) {
            this._consoleSession = this._createSession({
                mode: InspectorModes.console,
                title: `el-levert[${process.pid}]`
            });

            getLogger().info("## Inspector:\n" + this.inspectorUrl);
        }

        this.httpServer.listen(this.port);
        this.running = true;
    }

    close() {
        if (!this.enabled) {
            return;
        }

        for (const session of this._sessions.values()) {
            session.close();
        }

        this._sessions.clear();
        this._sessionUsers.clear();
        this._consoleSession = null;

        this.websocketServer?.close();
        this.httpServer?.close();

        delete this.websocketServer;
        delete this.httpServer;

        this.running = false;
        getLogger().info("Closed inspector server.");
    }

    createUserSession(options) {
        options = TypeTester.isObject(options) ? options : {};

        if (this.mode !== InspectorModes.user) {
            throw new VMError("User inspector isn't enabled.");
        }

        const userId = options.userId ?? null;

        if (!Util.nonemptyString(userId)) {
            throw new VMError("No user inspector id was provided.");
        } else if (this._sessionUsers.has(userId)) {
            throw new VMError("User already has an active inspector session.");
        }

        const session = this._createSession({
            actionTimeout: this.userInspectorActionTimeout,
            description: `el-levert inspector session for ${userId}`,
            mode: InspectorModes.user,
            title: options.title ?? `el-levert inspector [${userId}]`,
            url: options.url ?? "file://",
            userId
        });

        this._sessionUsers.set(userId, session.uuid);
        return session;
    }

    getConsoleSession() {
        return this._consoleSession;
    }

    getSessionInfo(session, host = `127.0.0.1:${this.port}`) {
        return session?.getAttachInfo(host) ?? null;
    }

    onSessionEmpty(session) {
        if (session == null) {
            return;
        }

        session.close();

        if (session.mode !== InspectorModes.user) {
            return;
        }

        this._sessions.delete(session.uuid);
        this._sessionUsers.delete(session.userId);
    }

    _createSession(options) {
        options = TypeTester.isObject(options) ? options : {};

        const session = new InspectorSession(this, {
            actionTimeout: 0,
            logPackets: this.logPackets,
            uuid: crypto.randomUUID(),
            ...options
        });

        this._sessions.set(session.uuid, session);
        return session;
    }

    _bindEvents() {
        this.httpServer.on("upgrade", this._httpUpgradeHandler);
        this.websocketServer.on("connection", this._socketListener);
        this.websocketServer.on("close", this._socketClosed);
    }

    _getReqUrl(req) {
        const host = req.headers.host ?? `127.0.0.1:${this.port}`;
        return new URL(req.url, `http://${host}`);
    }

    _getSessionPath(session, type) {
        switch (type) {
            case "list":
                return session?.listPath ?? "";
            case "version":
                return session?.versionPath ?? "";
            default:
                return "";
        }
    }

    _getSessionForHttp(pathname) {
        if (this.mode === InspectorModes.console) {
            const versionPath = this._getSessionPath(this._consoleSession, "version"),
                listPath = this._getSessionPath(this._consoleSession, "list");

            return pathname === versionPath || pathname === listPath ? this._consoleSession : null;
        }

        const match = pathname.match(/^\/([^/]+)\/json\/(list|version)$/);

        if (!match) {
            return null;
        }

        const [, uuid] = match;
        return this._sessions.get(uuid) ?? null;
    }

    _getSessionForWs(pathname) {
        if (!Util.nonemptyString(pathname)) {
            return null;
        }

        const match = pathname.match(/^\/([^/]+)$/);

        if (!match) {
            return null;
        }

        const [, uuid] = match;
        return this._sessions.get(uuid) ?? null;
    }

    _writeJson(res, statusCode, data) {
        res.writeHead(statusCode, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify(data));
    }

    _write404(res) {
        res.writeHead(404, {
            "Content-Type": "text/plain"
        });

        res.end("404 Not Found");
    }

    _httpReqHandler = (req, res) => {
        const url = this._getReqUrl(req),
            session = this._getSessionForHttp(url.pathname);

        if (session === null) {
            this._write404(res);
            return;
        }

        const host = req.headers.host ?? `127.0.0.1:${this.port}`,
            versionPath = this._getSessionPath(session, "version"),
            listPath = this._getSessionPath(session, "list");

        switch (url.pathname) {
            case versionPath:
                this._writeJson(res, 200, session.getVersionInfo());
                break;
            case listPath:
                this._writeJson(res, 200, [session.getTargetInfo(host)]);
                break;
            default:
                this._write404(res);
                break;
        }
    };

    _httpUpgradeHandler = (req, socket, head) => {
        const url = this._getReqUrl(req),
            session = this._getSessionForWs(url.pathname);

        if (session === null) {
            socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
            socket.destroy();
            return;
        }

        this.websocketServer.handleUpgrade(req, socket, head, ws => {
            this.websocketServer.emit("connection", ws, req, session);
        });
    };

    _socketListener = (socket, _req, session) => {
        session.attachSocket(socket);
    };

    _socketClosed = () => {
        getLogger().debug("Inspector websocket server closed.");
    };
}

export default InspectorServer;
