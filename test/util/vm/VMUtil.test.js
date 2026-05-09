import { describe, expect, test } from "vitest";

import VMHttpErrorTypes from "../../../src/util/vm/VMHttpErrorTypes.js";
import VMUtil from "../../../src/util/vm/VMUtil.js";

describe("VMUtil", () => {
    test("resolves nested properties and removes circular references", () => {
        const source = { root: { child: { value: 4 } } };
        const propertyMap = new Map([["root", source.root]]);

        expect(VMUtil.resolveObject("root.child.value", propertyMap).obj).toBe(4);
        expect(() => VMUtil.resolveObject("", propertyMap)).toThrow("no path");
        expect(() => VMUtil.resolveObject("root", null)).toThrow("no property map");
        expect(() => VMUtil.resolveObject("root.missing", propertyMap)).toThrow("Property not found");

        const circular = { alpha: 1 };
        circular.self = circular;
        circular.deep = {
            child: circular
        };

        expect(VMUtil.removeCircularReferences(circular)).toEqual({
            alpha: 1,
            self: "[Circular reference]",
            deep: {
                child: "[Circular reference]"
            }
        });
    });

    test("formats output and replies for script-safe transport", () => {
        expect(VMUtil.formatOutput(null)).toBeNull();
        expect(VMUtil.formatOutput(["a", "b"])).toBe("a, b");
        expect(VMUtil.formatOutput(12n)).toBe("12");
        expect(VMUtil.formatOutput(false)).toBe("false");
        expect(VMUtil.formatOutput(Symbol("x"))).toBeNull();

        const circular = {};
        circular.self = circular;
        expect(VMUtil.formatOutput(circular)).toBeNull();

        const reply = VMUtil.formatReply("hello", {
            embed: {
                description: "text",
                title: "title",
                ignored: "value"
            },
            file: {
                name: "out.txt"
            }
        });

        expect(reply.content).toBe("hello");
        expect(reply.embeds).toEqual([
            {
                description: "text",
                title: "title"
            }
        ]);
        expect(reply.file).toEqual({ name: "out.txt" });

        expect(
            VMUtil.formatReply({
                content: 7,
                embed: {
                    title: "only title"
                }
            })
        ).toEqual({
            content: "7",
            embeds: [
                {
                    title: "only title",
                    description: ""
                }
            ]
        });
    });

    test("builds request configs and response payloads", () => {
        const context = {
            abortSignal: {},
            timeRemaining: 25
        };

        const stringConfig = VMUtil.makeRequestConfig("https://example.com/test.json", context);
        expect(stringConfig.url).toBe("https://example.com/test.json");
        expect(stringConfig.timeout).toBe(25);
        expect(stringConfig.signal).toBe(context.abortSignal);
        expect(stringConfig.maxRedirects).toBe(5);
        expect(stringConfig.validateStatus(500)).toBe(true);

        const valueConfig = VMUtil.makeRequestConfig(
            {
                url: "https://example.com/test.json",
                timeout: 50,
                errorType: VMHttpErrorTypes.value
            },
            context
        );
        expect(valueConfig.timeout).toBe(25);
        expect(valueConfig.responseType).toBe("json");

        expect(
            VMUtil.makeRequestConfig(
                {
                    url: "https://example.com/page",
                    errorType: VMHttpErrorTypes.value
                },
                context
            ).responseType
        ).toBe("text");

        expect(() => VMUtil.makeRequestConfig(42, context)).toThrow("Invalid request data");

        expect(
            VMUtil.getResponseData(
                {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "Content-Type": ["text/plain"]
                    },
                    data: "ok"
                },
                null,
                {}
            )
        ).toEqual({
            status: 200,
            statusText: "OK",
            headers: {
                "content-type": "text/plain"
            },
            data: "ok"
        });

        expect(() =>
            VMUtil.getResponseData(
                {
                    status: 500,
                    headers: {},
                    data: null
                },
                new Error("bad"),
                {}
            )
        ).toThrow("Request failed with status code 500");

        expect(
            VMUtil.getResponseData(
                {
                    status: 404,
                    statusText: "Missing",
                    headers: {},
                    data: null,
                    request: {
                        res: {
                            responseUrl: "https://example.com/final"
                        }
                    }
                },
                new Error("missing"),
                {
                    errorType: VMHttpErrorTypes.value,
                    url: "https://example.com/start"
                }
            )
        ).toEqual({
            status: 404,
            statusText: "Missing",
            headers: {},
            data: null,
            ok: false,
            url: "https://example.com/final",
            error: {
                message: "missing"
            }
        });

        expect(
            VMUtil.getResponseData(
                null,
                new Error("offline"),
                {
                    errorType: VMHttpErrorTypes.value,
                    url: "https://example.com/start"
                }
            )
        ).toEqual({
            status: -1,
            statusText: "offline",
            headers: {},
            data: null,
            ok: false,
            url: "https://example.com/start",
            error: {
                message: "offline"
            }
        });
    });

    test("adds debugger statements, rewrites stack traces, and writes socket packets", () => {
        expect(VMUtil.addDebuggerStmt('"use strict";\nconsole.log(1)')).toContain("debugger;");
        expect(VMUtil.addDebuggerStmt("console.log(1)").startsWith("/* break on script start */ debugger;")).toBe(true);

        const ivmErr = new Error("boom");
        ivmErr.stack = "Error: boom\n at first\n at (<isolated-vm boundary>)\n at hidden";
        VMUtil.rewriteIVMStackTrace(ivmErr);
        expect(ivmErr.stack).not.toContain("hidden");

        const replErr = new Error("boom");
        replErr.stack = "Error: boom\n at first\n at REPL\n at hidden";
        VMUtil.rewriteReplStackTrace(replErr);
        expect(replErr.stack).not.toContain("hidden");

        const untouchedErr = new Error("boom");
        untouchedErr.stack = "Error: boom\n at first";
        VMUtil.rewriteIVMStackTrace(untouchedErr);
        expect(untouchedErr.stack).toContain("at first");

        const noStackErr = {};
        expect(VMUtil.rewriteStackTrace(noStackErr, () => true)).toBeUndefined();

        const blockedErr = new Error("boom");
        blockedErr.stack = "Error: boom\n at first\n at second";
        VMUtil.rewriteStackTrace(blockedErr, () => false);
        expect(blockedErr.stack).toContain("at second");

        const socket = {
            write: value => {
                socket.value = value;
            }
        };
        VMUtil.sockWrite(socket, "event", { ok: true });
        expect(socket.value).toBe('{"ok":true,"packetType":"event"}\n');

        const defaultPacketSocket = {
            write: value => {
                defaultPacketSocket.value = value;
            }
        };
        VMUtil.sockWrite(defaultPacketSocket, null, { ok: true });
        expect(defaultPacketSocket.value).toBe('{"ok":true,"packetType":"unknown"}\n');
    });
});
