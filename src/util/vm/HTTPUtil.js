import dns from "node:dns";
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { fileURLToPath } from "node:url";

import axios from "axios";

import Util from "../Util.js";
import ArrayUtil from "../ArrayUtil.js";
import ObjectUtil from "../ObjectUtil.js";

import { getHttpStatusText, httpStatusCodes } from "../misc/HttpStatusCodes.js";

import UtilError from "../../errors/UtilError.js";

function createFileResponseError(message, status, req) {
    return {
        message,
        response: {
            status,
            statusText: getHttpStatusText(status)
        },
        config: req
    };
}

const HTTPUtil = Object.freeze({
    protocolRegex: /^[^/:]+:\/*$/,
    leadingSlashRegex: /^[/]+/,
    trailingSlashRegex: /[/]+$/,
    paramSlashRegex: /\/(\?|&|#[^!])/g,
    paramSplitRegex: /(?:\?|&)+/,

    joinUrl: (...parts) => {
        const input = [...parts];

        let firstPart = Util.first(input);

        const result = [];

        if (typeof firstPart !== "string") {
            throw new UtilError("URL part must be a string");
        }

        if (HTTPUtil.protocolRegex.test(firstPart) && Util.multiple(input)) {
            firstPart = input.shift() + input.shift();
            input.unshift(firstPart);
        }

        input[0] = firstPart;

        for (let i = 0; i < input.length; i++) {
            let part = input[i];

            if (typeof part !== "string") {
                throw new UtilError("URL part must be a string");
            }

            if (Util.empty(part)) {
                continue;
            }

            if (i > 0) {
                part = part.replace(HTTPUtil.leadingSlashRegex, "");
            }

            part = part.replace(HTTPUtil.trailingSlashRegex, i === input.length - 1 ? "/" : "");
            result.push(part);
        }

        let str = result.join("/");
        str = str.replace(HTTPUtil.paramSlashRegex, "$1");

        const [beforeHash, afterHash] = str.split("#"),
            hash = Util.empty(afterHash) ? "" : "#" + afterHash;

        let paramParts = beforeHash.split(HTTPUtil.paramSplitRegex);
        paramParts = paramParts.filter(part => !Util.empty(part));

        const beforeParams = paramParts.shift(),
            params = (Util.empty(paramParts) ? "" : "?") + paramParts.join("&");

        str = beforeParams + params + hash;
        return str;
    },

    webProtocols: new Set(["http:", "https:"]),

    blockedMessage: "Access to local/private IP addresses is blocked",
    jsonRequestRegex: /\.(json|geojson)(?:[?#]|$)/i,

    createBlocklist: () => {
        const blocklist = new net.BlockList();

        blocklist.addSubnet("127.0.0.0", 8, "ipv4");
        blocklist.addSubnet("10.0.0.0", 8, "ipv4");
        blocklist.addSubnet("172.16.0.0", 12, "ipv4");
        blocklist.addSubnet("192.168.0.0", 16, "ipv4");
        blocklist.addSubnet("169.254.0.0", 16, "ipv4");
        blocklist.addSubnet("0.0.0.0", 8, "ipv4");
        blocklist.addAddress("::1", "ipv6");
        blocklist.addSubnet("fc00::", 7, "ipv6");
        blocklist.addSubnet("fe80::", 10, "ipv6");
        blocklist.addAddress("::", "ipv6");
        blocklist.addSubnet("::7f00:0", 104, "ipv6");
        blocklist.addSubnet("::0a00:0", 104, "ipv6");
        blocklist.addSubnet("::ac10:0", 108, "ipv6");
        blocklist.addSubnet("::c0a8:0", 112, "ipv6");
        blocklist.addSubnet("::a9fe:0", 112, "ipv6");
        blocklist.addSubnet("::0000:0", 104, "ipv6");

        return blocklist;
    },

    isBlockedIP: (ip, blocklist) => {
        if (typeof ip !== "string") {
            return false;
        }

        const version = net.isIP(ip);

        return version === 0 ? false : blocklist.check(ip, `ipv${version}`);
    },

    createSecureAgent: (_class, blocklist) => {
        const agent = new _class(),
            originalCreateConnection = agent.createConnection;

        agent.createConnection = function (options, cb) {
            const host = options.host ?? options.hostname;

            if (HTTPUtil.isBlockedIP(host, blocklist)) {
                const err = new UtilError(HTTPUtil.blockedMessage);

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

                    const addresses = Array.isArray(address) ? address : [{ address, family }];

                    for (const addrInfo of addresses) {
                        if (HTTPUtil.isBlockedIP(addrInfo.address, blocklist)) {
                            lookupCb(new UtilError(HTTPUtil.blockedMessage));
                            return;
                        }
                    }

                    lookupCb(null, address, family);
                });
            };

            return originalCreateConnection.call(this, options, cb);
        };

        return agent;
    },

    createSecureAgents: () => {
        const blocklist = HTTPUtil.createBlocklist();

        return {
            httpAgent: HTTPUtil.createSecureAgent(http.Agent, blocklist),
            httpsAgent: HTTPUtil.createSecureAgent(https.Agent, blocklist)
        };
    },

    createFilesystemAdapter:
        (maxDownloadSize = Infinity) =>
        async req => {
            let filePath;

            try {
                filePath = fileURLToPath(req.url);
            } catch {
                throw createFileResponseError(`Invalid file URL format: ${req.url}`, httpStatusCodes.BAD_REQUEST, req);
            }

            try {
                const stat = await fs.stat(filePath);

                if (!stat.isFile()) {
                    throw createFileResponseError(
                        `Path is not a regular file: ${req.url}`,
                        httpStatusCodes.NOT_FOUND,
                        req
                    );
                } else if (stat.size > maxDownloadSize) {
                    throw createFileResponseError(
                        `File size exceeds maximum download size of ${maxDownloadSize} bytes`,
                        httpStatusCodes.PAYLOAD_TOO_LARGE,
                        req
                    );
                }

                const data = await fs.readFile(filePath);
                let resData;

                if (req.responseType === "arraybuffer") {
                    resData = ArrayUtil.toUint8Array(data);
                } else {
                    const json = HTTPUtil.jsonRequestRegex.test(req.url) || req.responseType === "json",
                        text = data.toString("utf8");

                    try {
                        resData = json ? JSON.parse(text) : text;
                    } catch {
                        resData = text;
                    }
                }

                return {
                    data: resData,
                    status: httpStatusCodes.OK,
                    statusText: getHttpStatusText(httpStatusCodes.OK),
                    headers: {},
                    config: req
                };
            } catch (err) {
                if (
                    err.response?.status === httpStatusCodes.PAYLOAD_TOO_LARGE ||
                    err.response?.status === httpStatusCodes.NOT_FOUND
                ) {
                    throw err;
                }

                throw createFileResponseError(
                    `File not found or unreadable at: ${req.url}`,
                    httpStatusCodes.NOT_FOUND,
                    req
                );
            }
        },

    createAxiosClient: (options, ErrorClass = UtilError) => {
        options = ObjectUtil.guaranteeObject(options);

        const allowLocalhostRequests = options.allowLocalhostRequests ?? false,
            allowFilesystemRequests = options.allowFilesystemRequests ?? false;

        const maxUploadSize = options.maxUploadSize ?? Infinity,
            maxDownloadSize = options.maxDownloadSize ?? Infinity;

        const config = {
            maxBodyLength: maxUploadSize,
            maxContentLength: maxDownloadSize
        };

        if (!allowLocalhostRequests) {
            Object.assign(config, HTTPUtil.createSecureAgents());
        }

        const originalAdapter = axios.getAdapter("http");

        if (allowFilesystemRequests) {
            const filesystemAdapter = HTTPUtil.createFilesystemAdapter(maxDownloadSize);

            config.adapter = reqConfig => {
                if (reqConfig.url && reqConfig.url.startsWith("file://")) {
                    return filesystemAdapter(reqConfig);
                } else {
                    return originalAdapter(reqConfig);
                }
            };
        } else {
            config.adapter = originalAdapter;
        }

        const client = axios.create(config);

        client.interceptors.request.use(reqConfig => {
            let size = 0;

            if (reqConfig.data != null) {
                const defaultTransform = axios.defaults.transformRequest,
                    transformedData = defaultTransform.reduce(
                        (data, func) => func(data, reqConfig.headers),
                        reqConfig.data
                    );

                size = Util.getByteLength(transformedData);
            }

            if (size > maxUploadSize) {
                throw new ErrorClass(`Request body exceeds maximum upload size of ${maxUploadSize} bytes`);
            }

            return reqConfig;
        });

        return client;
    },

    getHost: url => {
        let parsed;

        try {
            parsed = new URL(url);
        } catch {
            return null;
        }

        return HTTPUtil.webProtocols.has(parsed.protocol) ? parsed.hostname.toLowerCase() : null;
    },

    getContentType: headers => String(headers?.["content-type"] ?? "").toLowerCase()
});

export default HTTPUtil;
