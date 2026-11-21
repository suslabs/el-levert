import http from "node:http";

import { describe, expect, test } from "vitest";

import HttpUtil from "../../../src/util/misc/HttpUtil.js";

describe("HttpUtil", () => {
    test("blocks loopback, private, link-local and mapped addresses", () => {
        const blocklist = HttpUtil.createBlocklist();

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
            expect(HttpUtil.isBlockedIP(ip, blocklist)).toBe(true);
        }

        for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
            expect(HttpUtil.isBlockedIP(ip, blocklist)).toBe(false);
        }
    });

    test("ignores values that aren't IP addresses", () => {
        const blocklist = HttpUtil.createBlocklist();

        expect(HttpUtil.isBlockedIP("localhost", blocklist)).toBe(false);
        expect(HttpUtil.isBlockedIP(null, blocklist)).toBe(false);
    });

    test("secure agents refuse to connect to blocked hosts", async () => {
        const { httpAgent, httpsAgent } = HttpUtil.createSecureAgents();

        expect(httpsAgent).toBeDefined();

        const err = await new Promise(resolve => {
            const req = http.get({ host: "127.0.0.1", port: 9, agent: httpAgent }, () => resolve(null));
            req.on("error", resolve);
        });

        expect(err.message).toBe(HttpUtil.blockedMessage);
    });

    test("only resolves hosts of web URLs", () => {
        expect(HttpUtil.getHost("https://Example.com/a?b")).toBe("example.com");
        expect(HttpUtil.getHost("http://127.0.0.1:8080/")).toBe("127.0.0.1");
        expect(HttpUtil.getHost("tag:steel")).toBeNull();
        expect(HttpUtil.getHost("questbook:12")).toBeNull();
        expect(HttpUtil.getHost("not a url")).toBeNull();
    });

    test("normalizes content types", () => {
        expect(HttpUtil.getContentType({ "content-type": "Text/HTML; charset=utf-8" })).toBe(
            "text/html; charset=utf-8"
        );
        expect(HttpUtil.getContentType({})).toBe("");
        expect(HttpUtil.getContentType(undefined)).toBe("");
    });
});
