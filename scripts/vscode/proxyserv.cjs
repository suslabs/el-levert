const http = require("http");
const WebSocket = require("ws");
const os = require("os");

const targetPort = 8080,
    proxyPort = 9229;

const targetWsUrl = `ws://127.0.0.1:${targetPort}`,
    proxyWsUrl = `ws://localhost:${targetPort}`;

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
            res.end("Not found");
            break;
    }
});

server.on("upgrade", (req, socket, head) => {
    const proxyWs = new WebSocket(targetWsUrl);

    proxyWs.on("open", () => {
        const clientSocket = new WebSocket.Server({ noServer: true });
        clientSocket.handleUpgrade(req, socket, head, ws => {
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
                proxyWs.close();
            });

            proxyWs.on("close", () => {
                ws.close();
            });
        });
    });

    proxyWs.on("error", err => {
        console.error("Error occured with proxy WebSocket connection:", err);
        socket.destroy();
    });
});

server.listen(proxyPort, () => {
    console.log(`WebSocket proxy server is listening on ${proxyWsUrl}`);
});
