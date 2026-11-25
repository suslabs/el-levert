import { once } from "node:events";
import http from "node:http";

import HTTPUtil from "../../util/vm/HTTPUtil.js";
import { httpStatusCodes } from "../../util/misc/HttpStatusCodes.js";

class BrowserProxy {
    constructor() {
        this._agent = HTTPUtil.createSecureAgent(http.Agent, HTTPUtil.createBlocklist());
        this._sockets = new Set();
        this._server = http.createServer((req, res) => this._forward(req, res));

        this._server.on("connect", (req, socket, head) => this._tunnel(req, socket, head));
        this._server.on("connection", socket => {
            this._sockets.add(socket);
            socket.once("close", () => this._sockets.delete(socket));
        });
    }

    async start() {
        if (!this._server.listening) {
            this._server.listen(0, "127.0.0.1");
            await once(this._server, "listening");
        }

        return this._server.address().port;
    }

    async close() {
        if (!this._server.listening) {
            return;
        }

        const closed = once(this._server, "close");
        this._server.close();

        this._agent.destroy();

        for (const socket of this._sockets) {
            socket.destroy();
        }

        await closed;
    }

    _forward(req, res) {
        const target = URL.canParse(req.url) ? new URL(req.url) : null;

        if (target?.protocol !== "http:") {
            res.writeHead(httpStatusCodes.BAD_REQUEST).end();
            return;
        }

        const headers = { ...req.headers, host: target.host };
        delete headers["proxy-authorization"];
        delete headers["proxy-connection"];

        const upstream = http.request(target, { method: req.method, headers, agent: this._agent }, response => {
            res.writeHead(response.statusCode, response.headers);
            response.on("error", () => res.destroy());
            response.pipe(res);
        });

        upstream.on("error", () => {
            if (res.headersSent) {
                res.destroy();
            } else {
                res.writeHead(httpStatusCodes.BAD_GATEWAY).end();
            }
        });

        res.once("close", () => upstream.destroy());
        req.pipe(upstream);
    }

    _tunnel(req, socket, head) {
        const authority = req.url.match(/^(\[[\da-f:]+\]|[\w.-]+):(\d+)$/i);

        if (authority === null) {
            socket.destroy();
            return;
        }

        const [, host, port] = authority;
        const target = URL.canParse(`http://${host}:${port}`) ? new URL(`http://${host}:${port}`) : null;

        if (target === null || Number(port) === 0) {
            socket.destroy();
            return;
        }

        const upstream = this._agent.createConnection(
            { host: target.hostname.replace(/^\[|\]$/g, ""), port: Number(port) },
            err => {
                if (err) {
                    socket.destroy();
                    return;
                }

                socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
                upstream.write(head);
                socket.pipe(upstream).pipe(socket);
            }
        );

        if (upstream) {
            upstream.on("error", () => socket.destroy());
            upstream.once("close", () => socket.destroy());
            socket.once("close", () => upstream.destroy());
            socket.on("error", () => upstream.destroy());
        }
    }
}

export default BrowserProxy;
