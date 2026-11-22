import http from "node:http";

import { describe, expect, test } from "vitest";

import HTTPUtil from "../../../src/util/vm/HTTPUtil.js";

describe("HTTPUtil", () => {
    test("blocks local and private addresses", () => {
        const blocklist = HTTPUtil.createBlocklist();

        for (const ip of [
            "127.0.0.1",
            "10.1.2.3",
            "172.16.0.1",
            "192.168.1.1",
            "169.254.1.1",
            "0.0.0.0",
            "::1",
            "fd00::1",
            "fe80::1"
        ]) {
            expect(HTTPUtil.isBlockedIP(ip, blocklist)).toBe(true);
        }

        for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
            expect(HTTPUtil.isBlockedIP(ip, blocklist)).toBe(false);
        }
    });

    test("ignores values that are not IP addresses", () => {
        const blocklist = HTTPUtil.createBlocklist();

        expect(HTTPUtil.isBlockedIP("localhost", blocklist)).toBe(false);
        expect(HTTPUtil.isBlockedIP(null, blocklist)).toBe(false);
    });

    test("secure agents refuse blocked hosts", async () => {
        const { httpAgent, httpsAgent } = HTTPUtil.createSecureAgents();

        expect(httpsAgent).toBeDefined();

        const err = await new Promise(resolve => {
            const req = http.get({ host: "127.0.0.1", port: 9, agent: httpAgent }, () => resolve(null));
            req.on("error", resolve);
        });

        expect(err.message).toBe(HTTPUtil.blockedMessage);
    });

    test("returns hosts only for HTTP and HTTPS URLs", () => {
        expect(HTTPUtil.getHost("https://Example.com/a?b")).toBe("example.com");
        expect(HTTPUtil.getHost("http://127.0.0.1:8080/")).toBe("127.0.0.1");
        expect(HTTPUtil.getHost("tag:steel")).toBeNull();
        expect(HTTPUtil.getHost("questbook:12")).toBeNull();
        expect(HTTPUtil.getHost("not a url")).toBeNull();
    });

    test("normalizes content types", () => {
        expect(HTTPUtil.getContentType({ "content-type": "Text/HTML; charset=utf-8" })).toBe(
            "text/html; charset=utf-8"
        );
        expect(HTTPUtil.getContentType({})).toBe("");
        expect(HTTPUtil.getContentType(undefined)).toBe("");
    });
});
