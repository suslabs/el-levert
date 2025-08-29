const http = require("http");
const WebSocket = require("ws");

const targetPort = 8080,
    proxyPort = 9229;

const targetWsUrl = `ws://127.0.0.1:${targetPort}`,
    proxyWsUrl = `ws://localhost:${proxyPort}`;

let connectionCount = 0;

let httpServer, wsServer;
[httpServer, wsServer] = Array(2).fill(null);

function httpReqHandler(req, res) {
    switch (req.url) {
        case "/json/version":
            const versionInfo = {
                Browser: `node.js/${process.version}`,
                "Protocol-Version": "1.1"
            };

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(versionInfo));

            break;

        case "/json/list":
            const listInfo = [
                {
                    id: "1",
                    type: "node",
                    webSocketDebuggerUrl: targetWsUrl
                }
            ];

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(listInfo));

            break;

        default:
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("404 Not Found");

            break;
    }
}

function httpUpgradeHandler(req, socket, head) {
    const connection_id = ++connectionCount;

    console.log(`${connection_id}: Recieved connection.`);
    const proxyWs = new WebSocket(targetWsUrl);

    proxyWs.on("open", () => {
        wsServer.handleUpgrade(req, socket, head, ws => {
            wsServer.emit("connection", ws, proxyWs, connection_id);
        });
    });

    proxyWs.on("error", err => {
        if (err.code === "ECONNREFUSED") {
            console.error("ERROR: Inspector connection refused. Make sure that the bot is started.");
        } else {
            console.error("ERROR: Occured with proxy WebSocket connection:", err.message);
        }

        proxyWs.close();
    });
}

function wsConenctionHandler(ws, proxyWs, connection_id) {
    console.log(`${connection_id}: WebSocket connected.`);

    ws.on("message", message => {
        if (proxyWs.readyState === WebSocket.OPEN) {
            proxyWs.send(message);
        }
    });

    proxyWs.on("message", message => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    });

    ws.on("close", () => {
        console.log(`${connection_id}: WebSocket disconnected.\n`);
        proxyWs.close();
    });

    proxyWs.on("close", () => {
        ws.close();
    });
}

function startServer() {
    httpServer = http.createServer(httpReqHandler);

    wsServer = new WebSocket.Server({
        noServer: true
    });

    httpServer.on("upgrade", httpUpgradeHandler);

    wsServer.on("connection", wsConenctionHandler);

    wsServer.on("error", err => {
        console.error("ERROR: Occured with proxy WebSocket connection:", err.message);
    });

    httpServer.listen(proxyPort, () => {
        console.log(`WebSocket proxy server is listening on: ${proxyWsUrl}\n`);
    });
}

startServer();
