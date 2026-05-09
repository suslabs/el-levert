import http from "node:http";

function parseBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];

        req.on("data", chunk => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}

function listenServer(server) {
    return new Promise((resolve, reject) => {
        server.listen(0, "127.0.0.1", err => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

function closeServer(server) {
    return new Promise((resolve, reject) => {
        server.close(err => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

async function createHttpStubServer(routes = {}) {
    const state = {
        requests: []
    };

    const server = http.createServer(async (req, res) => {
        const body = await parseBody(req),
            url = new URL(req.url, "http://127.0.0.1");

        state.requests.push({
            method: req.method,
            pathname: url.pathname,
            search: url.search,
            body
        });

        const handlerKey = `${req.method} ${url.pathname}`,
            handler = routes[handlerKey] ?? routes[url.pathname];

        if (typeof handler !== "function") {
            res.statusCode = 404;
            res.end("not found");
            return;
        }

        const out = await handler({
            req,
            res,
            url,
            body,
            state
        });

        if (res.writableEnded) {
            return;
        } else if (typeof out === "string" || Buffer.isBuffer(out)) {
            res.end(out);
            return;
        } else if (out == null) {
            res.end();
            return;
        }

        res.statusCode = out.statusCode ?? 200;

        for (const [key, value] of Object.entries(out.headers ?? {})) {
            res.setHeader(key, value);
        }

        if (typeof out.json !== "undefined") {
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(out.json));
        } else {
            res.end(out.body ?? "");
        }
    });

    await listenServer(server);

    const address = server.address();

    return {
        state,
        server,
        url: `http://127.0.0.1:${address.port}`,
        close: () => closeServer(server)
    };
}

export default createHttpStubServer;
