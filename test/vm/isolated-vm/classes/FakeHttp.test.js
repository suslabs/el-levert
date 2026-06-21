import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import "../../../../setupGlobals.js";
import dns from "node:dns";
import net from "node:net";

vi.mock("../../../../src/LevertClient.js", () => {
    return {
        getLogger: () => ({
            error: () => {},
            info: () => {},
            warn: () => {}
        }),
        getClient: () => null,
        getConfig: () => null
    };
});

vi.mock("isolated-vm", () => {
    const ExternalCopy = class {
        constructor(val) {
            this.val = val;
        }
        copyInto() {
            return this.val;
        }
    };
    return {
        default: {
            ExternalCopy
        },
        ExternalCopy
    };
});

import FakeHttp from "../../../../src/vm/isolated-vm/classes/FakeHttp.js";

describe("FakeHttp security checks", () => {
    let lookupSpy;
    let socketConnectSpy;

    const originalConnect = net.Socket.prototype.connect;

    beforeEach(() => {
        lookupSpy = vi.spyOn(dns, "lookup");
        socketConnectSpy = vi.spyOn(net.Socket.prototype, "connect");

        socketConnectSpy.mockImplementation(function (options, cb) {
            const result = originalConnect.call(this, options, cb);
            setTimeout(() => {
                this.destroy(new Error("Connection allowed"));
            }, 50);
            return result;
        });
    });

    afterEach(() => {
        lookupSpy.mockRestore();
        socketConnectSpy.mockRestore();
    });

    const localIPv4s = [
        "127.0.0.1",
        "127.0.0.2",
        "127.255.255.255",
        "10.0.0.1",
        "10.255.255.255",
        "172.16.0.1",
        "172.31.255.255",
        "192.168.1.1",
        "192.168.255.255",
        "169.254.1.1",
        "0.0.0.0"
    ];

    const localIPv6s = [
        "::1",
        "0:0:0:0:0:0:0:1",
        "::",
        "fc00::1",
        "fd00::1",
        "fe80::1",
        "::ffff:127.0.0.1",
        "::ffff:192.168.1.1",
        "::127.0.0.1",
        "::192.168.1.1",
        "::10.0.0.1",
        "::172.16.0.1",
        "::169.254.1.1",
        "::0.0.0.0",
        "::0.0.0.1"
    ];

    test("blocks requests to raw local IPv4 addresses", async () => {
        for (const ip of localIPv4s) {
            const data = {
                url: `http://${ip}`,
                errorType: "value"
            };
            const res = await FakeHttp.request(undefined, data);
            expect(res.error).toBeDefined();
            expect(res.error.message).toContain("Access to local/private IP addresses is blocked");
        }
    });

    test("blocks requests to raw local IPv6 addresses", async () => {
        for (const ip of localIPv6s) {
            const url = ip.includes(":") ? `http://[${ip}]` : `http://${ip}`;
            const data = {
                url,
                errorType: "value"
            };
            const res = await FakeHttp.request(undefined, data);
            expect(res.error).toBeDefined();
            expect(res.error.message).toContain("Access to local/private IP addresses is blocked");
        }
    });

    test("blocks hostname resolutions that result in local IPs", async () => {
        lookupSpy.mockImplementation((hostname, options, callback) => {
            if (hostname === "attacker-domain.com") {
                process.nextTick(() => {
                    if (options.all) {
                        callback(null, [{ address: "127.0.0.1", family: 4 }]);
                    } else {
                        callback(null, "127.0.0.1", 4);
                    }
                });
            } else if (hostname === "attacker-ipv6.com") {
                process.nextTick(() => {
                    if (options.all) {
                        callback(null, [{ address: "::1", family: 6 }]);
                    } else {
                        callback(null, "::1", 6);
                    }
                });
            } else {
                process.nextTick(() => {
                    callback(new Error("Not found"));
                });
            }
        });

        const res1 = await FakeHttp.request(undefined, {
            url: "http://attacker-domain.com",
            errorType: "value"
        });
        expect(res1.error).toBeDefined();
        expect(res1.error.message).toContain("Access to local/private IP addresses is blocked");

        const res2 = await FakeHttp.request(undefined, {
            url: "http://attacker-ipv6.com",
            errorType: "value"
        });
        expect(res2.error).toBeDefined();
        expect(res2.error.message).toContain("Access to local/private IP addresses is blocked");
    });

    test("blocks hostname resolutions with multiple IPs if any is local", async () => {
        lookupSpy.mockImplementation((hostname, options, callback) => {
            if (hostname === "attacker-mixed.com") {
                process.nextTick(() => {
                    callback(null, [
                        { address: "8.8.8.8", family: 4 },
                        { address: "10.0.0.1", family: 4 }
                    ]);
                });
            } else {
                process.nextTick(() => {
                    callback(new Error("Not found"));
                });
            }
        });

        const res = await FakeHttp.request(undefined, {
            url: "http://attacker-mixed.com",
            errorType: "value"
        });
        expect(res.error).toBeDefined();
        expect(res.error.message).toContain("Access to local/private IP addresses is blocked");
    });

    test("allows connection attempts to public IPs without blocking (eventually fails with connection error)", async () => {
        lookupSpy.mockImplementation((hostname, options, callback) => {
            if (hostname === "safe.com") {
                process.nextTick(() => {
                    if (options.all) {
                        callback(null, [{ address: "9.9.9.9", family: 4 }]);
                    } else {
                        callback(null, "9.9.9.9", 4);
                    }
                });
            } else {
                process.nextTick(() => {
                    callback(new Error("Not found"));
                });
            }
        });

        const res = await FakeHttp.request(undefined, {
            url: "http://safe.com",
            errorType: "value"
        });

        expect(res.error).toBeDefined();
        expect(res.error.message).toContain("Connection allowed");
    });
});
