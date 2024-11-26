const http = require("http");
const WebSocket = require("ws");
const os = require("os");

const targetPort = 8080,
    proxyPort = 9229;

const targetWsUrl = `ws://127.0.0.1:${targetPort}`,
    proxyWsUrl = `ws://localhost:${targetPort}`;

let connectionCount = 0;

const server = http.createServer((req, res) => {
    switch (req.url) {
        case "/json/version": {
            const versionInfo = {
                Browser: `node.js/${process.version}`,
                "Protocol-Version": "1.1"
            };

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(versionInfo));

            break;
        }
        case "/json/list": {
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
        }
        default:
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("404 Not Found");
            break;
    }
});

server.on("upgrade", (req, socket, head) => {
    connectionCount++;
    const currConnection = connectionCount;

    console.log(`${currConnection}: Recieved connection.`);
    const proxyWs = new WebSocket(targetWsUrl);

    proxyWs.on("open", () => {
        websocketServer.handleUpgrade(req, socket, head, ws => {
            websocketServer.emit("connection", ws, proxyWs, currConnection);
        });
    });

    proxyWs.on("error", err => {
        console.error("Error occured with proxy WebSocket connection:\n", err, "\n");
        proxyWs.close();
    });
});

const websocketServer = new WebSocket.Server({ noServer: true });

websocketServer.on("connection", (ws, proxyWs, currConnection) => {
    console.log(`${currConnection}: WebSocket connected.`);

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
        console.log(`${currConnection}: WebSocket disconnected.\n`);
        proxyWs.close();
    });

    proxyWs.on("close", () => {
        ws.close();
    });
});

websocketServer.on("error", err => {
    console.error("Error occured with proxy WebSocket connection:", err);
});

server.listen(proxyPort, () => {
    console.log(`WebSocket proxy server is listening on ${proxyWsUrl}\n`);
});
