import dns from "node:dns";
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { fileURLToPath } from "node:url";

import axios from "axios";
import ivm from "isolated-vm";
const { ExternalCopy } = ivm;

import { getLogger } from "../../../LevertClient.js";

import VMUtil from "../../../util/vm/VMUtil.js";
import TypeTester from "../../../util/TypeTester.js";

import VMError from "../../../errors/VMError.js";

const allowLocalhostRequests = false,
    allowFilesystemRequests = false;

function createBlocklist() {
    const blocklist = new net.BlockList();

    // IPv4 Localhost / Loopback
    blocklist.addSubnet("127.0.0.0", 8, "ipv4");

    // IPv4 Private Network Areas (RFC 1918)
    blocklist.addSubnet("10.0.0.0", 8, "ipv4");
    blocklist.addSubnet("172.16.0.0", 12, "ipv4");
    blocklist.addSubnet("192.168.0.0", 16, "ipv4");

    // IPv4 Link-Local
    blocklist.addSubnet("169.254.0.0", 16, "ipv4");

    // IPv4 Local Endpoint
    blocklist.addAddress("0.0.0.0", "ipv4");

    // IPv6 Localhost / Loopback
    blocklist.addAddress("::1", "ipv6");

    // IPv6 Unique Local Addresses (ULA)
    blocklist.addSubnet("fc00::", 7, "ipv6");

    // IPv6 Link-Local
    blocklist.addSubnet("fe80::", 10, "ipv6");

    // IPv6 Local Endpoint
    blocklist.addAddress("::", "ipv6");

    // IPv4-compatible mapped local/private IPv6 ranges (::/96)
    blocklist.addSubnet("::7f00:0", 104, "ipv6");
    blocklist.addSubnet("::0a00:0", 104, "ipv6");
    blocklist.addSubnet("::ac10:0", 108, "ipv6");
    blocklist.addSubnet("::c0a8:0", 112, "ipv6");
    blocklist.addSubnet("::a9fe:0", 112, "ipv6");
    blocklist.addSubnet("::0000:0", 104, "ipv6");

    return blocklist;
}

function checkIP(ip, blocklist) {
    if (typeof ip !== "string") {
        return false;
    }

    const version = net.isIP(ip);

    if (version === 0) {
        return false;
    }

    return blocklist.check(ip, `ipv${version}`);
}

function createSecureAgent(_class, blocklist) {
    const agent = new _class();

    const originalCreateConnection = agent.createConnection;

    agent.createConnection = function (options, cb) {
        const host = options.host;

        if (checkIP(host, blocklist)) {
            const err = new VMError("Access to local/private IP addresses is blocked");

            if (typeof cb === "function") {
                cb(err);
                return;
            } else {
                throw err;
            }
        }

        options.lookup = (hostname, lookupOpts, lookupCb) => {
            dns.lookup(hostname, lookupOpts, (err, address, family) => {
                if (err) {
                    lookupCb(err);
                    return;
                }

                const addresses = Array.isArray(address) ? address : [{ address: address, family }];

                for (const addrInfo of addresses) {
                    if (checkIP(addrInfo.address, blocklist)) {
                        lookupCb(new VMError("Access to local/private IP addresses is blocked"));
                        return;
                    }
                }

                lookupCb(null, address, family);
            });
        };

        return originalCreateConnection.call(this, options, cb);
    };

    return agent;
}

async function fsAdapter(req) {
    let filePath;

    try {
        filePath = fileURLToPath(req.url);
    } catch (err) {
        return Promise.reject({
            message: `Invalid file URL format: ${req.url}`,
            response: { status: 400, statusText: "Bad Request" },
            config: req
        });
    }

    try {
        const data = await fs.readFile(filePath);

        let resData;

        if (req.responseType === "arraybuffer") {
            resData = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        } else {
            const json = req.url.endsWith(".json") || req.responseType === "json",
                text = data.toString("utf8");

            resData = json ? JSON.parse(text) : text;
        }

        return {
            data: resData,
            status: 200,
            statusText: "OK",
            headers: {},
            config: req
        };
    } catch (err) {
        return Promise.reject({
            message: `File not found or unreadable at: ${req.url}`,
            response: {
                status: 404,
                statusText: "Not Found"
            },
            config: req
        });
    }
}

function createFakeAxios() {
    const config = {};

    if (!allowLocalhostRequests) {
        const blocklist = createBlocklist();

        config.httpAgent = createSecureAgent(http.Agent, blocklist);
        config.httpsAgent = createSecureAgent(https.Agent, blocklist);
    }

    const originalAdapter = axios.getAdapter("http");

    if (allowFilesystemRequests) {
        config.adapter = reqConfig => {
            if (reqConfig.url && reqConfig.url.startsWith("file://")) {
                return fsAdapter(reqConfig);
            } else {
                return originalAdapter(reqConfig);
            }
        };
    } else {
        config.adapter = originalAdapter;
    }

    const client = axios.create(config);

    client.interceptors.request.use(reqConfig => {
        let bodyBuffer = null;

        if (reqConfig.data == null) {
            bodyBuffer = Buffer.alloc(0);
        } else {
            const defaultTransform = axios.defaults.transformRequest,
                transformedData = defaultTransform.reduce(
                    (data, func) => func(data, reqConfig.headers),
                    reqConfig.data
                );

            bodyBuffer = Buffer.from(transformedData, "utf8");
        }

        reqConfig.bodyBuffer = bodyBuffer;
        return reqConfig;
    });

    return client;
}

const fakeAxios = createFakeAxios();

const FakeHttp = Object.freeze({
    request: async (context, data) => {
        const reqConfig = VMUtil.makeRequestConfig(data, context);

        let res = null,
            reqErr = null;

        try {
            res = await fakeAxios.request(reqConfig);
        } catch (err) {
            reqErr = err;

            if (TypeTester.className(err) === "AxiosError") {
                getLogger().error("Axios request error:", err);
                res = err.response;
            } else {
                getLogger().error("Script request error:", err);
            }
        }

        const resData = VMUtil.getResponseData(res, reqErr, reqConfig);
        return new ExternalCopy(resData).copyInto();
    }
});

export default FakeHttp;
