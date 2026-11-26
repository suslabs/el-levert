import http from "node:http";

import { AxiosHeaders } from "axios";
import { describe, expect, test } from "vitest";

import HTTPUtil from "../../../src/util/vm/HTTPUtil.js";

describe("HTTPUtil", () => {
    test("joins URL parts, query parameters, and fragments", () => {
        expect(HTTPUtil.joinUrl("https://", "example.com/", "/api/", "/item/")).toBe("https://example.com/api/item/");
        expect(HTTPUtil.joinUrl("https://example.com/api/", "?a=1", "&b=2", "#section")).toBe(
            "https://example.com/api?a=1&b=2#section"
        );
        expect(HTTPUtil.joinUrl("file:///", "folder", "file.txt")).toBe("file:///folder/file.txt");
        expect(HTTPUtil.joinUrl("http://localhost:2358/submissions/", "token", "?base64_encoded=false")).toBe(
            "http://localhost:2358/submissions/token?base64_encoded=false"
        );
        expect(HTTPUtil.joinUrl("https://example.com", "", "/path")).toBe("https://example.com/path");
        expect(() => HTTPUtil.joinUrl("https://example.com", 123)).toThrow("URL part must be a string");
        expect(() => HTTPUtil.joinUrl()).toThrow("URL part must be a string");
    });

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

    test("does not enforce size or timeout limits when set to -1", () => {
        const client = HTTPUtil.createAxiosClient({ maxUploadSize: -1, maxDownloadSize: -1 });
        expect(client.defaults.maxBodyLength).toBe(-1);
        expect(client.defaults.maxContentLength).toBe(-1);

        const reqConfig = client.interceptors.request.handlers[0].fulfilled({
            data: "hello world",
            timeout: -1
        });
        expect(reqConfig.timeout).toBeUndefined();

        const boundedClient = HTTPUtil.createAxiosClient({ maxUploadSize: 5 });
        expect(() =>
            boundedClient.interceptors.request.handlers[0].fulfilled({
                data: "hello world",
                headers: new AxiosHeaders()
            })
        ).toThrow("Request body exceeds maximum upload size of 5 bytes");
    });
});
