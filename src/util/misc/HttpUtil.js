import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

import UtilError from "../../errors/UtilError.js";

const HttpUtil = Object.freeze({
    blockedMessage: "Access to local/private IP addresses is blocked",

    createBlocklist: () => {
        const blocklist = new net.BlockList();

        // IPv4 Localhost / Loopback
        blocklist.addSubnet("127.0.0.0", 8, "ipv4");

        // IPv4 Private Network Areas (RFC 1918)
        blocklist.addSubnet("10.0.0.0", 8, "ipv4");
        blocklist.addSubnet("172.16.0.0", 12, "ipv4");
        blocklist.addSubnet("192.168.0.0", 16, "ipv4");

        // IPv4 Link-Local
        blocklist.addSubnet("169.254.0.0", 16, "ipv4");

        // IPv4 This Host / Local Endpoint (0.0.0.0/8)
        blocklist.addSubnet("0.0.0.0", 8, "ipv4");

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
    },

    isBlockedIP: (ip, blocklist) => {
        if (typeof ip !== "string") {
            return false;
        }

        const version = net.isIP(ip);

        if (version === 0) {
            return false;
        }

        return blocklist.check(ip, `ipv${version}`);
    },

    createSecureAgent: (_class, blocklist) => {
        const agent = new _class(),
            originalCreateConnection = agent.createConnection;

        agent.createConnection = function (options, cb) {
            const host = options.host ?? options.hostname;

            if (HttpUtil.isBlockedIP(host, blocklist)) {
                const err = new UtilError(HttpUtil.blockedMessage);

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
                        if (HttpUtil.isBlockedIP(addrInfo.address, blocklist)) {
                            lookupCb(new UtilError(HttpUtil.blockedMessage));
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
        const blocklist = HttpUtil.createBlocklist();

        return {
            httpAgent: HttpUtil.createSecureAgent(http.Agent, blocklist),
            httpsAgent: HttpUtil.createSecureAgent(https.Agent, blocklist)
        };
    },

    webProtocols: new Set(["http:", "https:"]),

    getHost: url => {
        let parsed;

        try {
            parsed = new URL(url);
        } catch {
            return null;
        }

        return HttpUtil.webProtocols.has(parsed.protocol) ? parsed.hostname.toLowerCase() : null;
    },

    getContentType: headers => {
        return String(headers?.["content-type"] ?? "").toLowerCase();
    }
});

export default HttpUtil;
